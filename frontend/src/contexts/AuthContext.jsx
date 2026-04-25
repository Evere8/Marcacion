import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Hard timeout for any single REST query (ms).
const QUERY_TIMEOUT_MS = 6000;

// Direct REST fetch (bypasses supabase-js so we can hard-timeout the network call).
async function fetchProfile(userId, accessToken, signal) {
  const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*`;
  const r = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${accessToken || SUPABASE_ANON}`,
      Accept: 'application/json',
    },
    signal,
  });
  if (!r.ok) throw new Error(`profiles ${r.status}`);
  const arr = await r.json();
  return Array.isArray(arr) && arr.length ? arr[0] : null;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const reqIdRef = useRef(0);
  const lastUserIdRef = useRef(null);

  const loadProfile = useCallback(async (userId, accessToken) => {
    if (!userId) return;
    const myId = ++reqIdRef.current;
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(), QUERY_TIMEOUT_MS);
    try {
      const data = await fetchProfile(userId, accessToken, ctrl.signal);
      if (myId !== reqIdRef.current) return;
      if (data) {
        setProfile(data);
        setProfileMissing(false);
      } else {
        setProfileMissing(true);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auth] loadProfile failed:', e?.message || e);
      if (myId === reqIdRef.current) setProfileMissing(true);
    } finally {
      clearTimeout(killer);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Hard fail-safe so the loading splash NEVER lasts forever.
    const bootFailsafe = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 2500);

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return;
      const newUserId = s?.user?.id || null;
      // Only update session state if the user actually changed
      // (prevents constant re-renders on TOKEN_REFRESHED).
      if (newUserId !== lastUserIdRef.current) {
        lastUserIdRef.current = newUserId;
        setSession(s || null);
        setProfile(null);
        setProfileMissing(false);
      }
      setLoading(false);
      if (s?.user) {
        // Defer to avoid Supabase deadlocks inside auth callback.
        setTimeout(() => {
          if (!cancelled) loadProfile(s.user.id, s.access_token);
        }, 0);
      } else {
        setProfile(null);
        setProfileMissing(false);
      }
    });

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (cancelled) return;
      // Re-fetch profile if we're signed-in but don't have one yet.
      const uid = lastUserIdRef.current;
      if (uid && !profile) {
        Promise.resolve(supabase.auth.getSession())
          .then(({ data } = {}) => {
            const tok = data?.session?.access_token;
            if (!cancelled) loadProfile(uid, tok);
          })
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(bootFailsafe);
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProfile]);

  // Watchdog: profile loading > 7s ⇒ surface retry UI. Uses ref-stable user id.
  const userIdForWatch = session?.user?.id || null;
  useEffect(() => {
    if (!userIdForWatch) return;
    if (profile) return;
    if (profileMissing) return;
    const t = setTimeout(() => setProfileMissing(true), 7000);
    return () => clearTimeout(t);
  }, [userIdForWatch, profile, profileMissing]);

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    setSession(null);
    setProfile(null);
    setProfileMissing(false);
    lastUserIdRef.current = null;
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    } catch {}
    window.location.replace('/login');
  }

  async function retryLoadProfile() {
    setProfileMissing(false);
    if (session?.user) {
      const tok = session.access_token;
      await loadProfile(session.user.id, tok);
    }
  }

  const value = {
    session,
    profile,
    profileMissing,
    user: session?.user || null,
    loading,
    signIn,
    signOut,
    retryLoadProfile,
    refreshProfile: () =>
      session?.user && loadProfile(session.user.id, session.access_token),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
