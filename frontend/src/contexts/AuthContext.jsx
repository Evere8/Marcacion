import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Hard timeout for any single REST query (ms).
const QUERY_TIMEOUT_MS = 6000;
// Boot watchdog — if onAuthStateChange never fires, force loading=false.
const BOOT_TIMEOUT_MS = 3000;

// Direct REST fetch with abortable timeout. We bypass supabase-js for the
// profile read because supabase-js's PostgREST client has been observed to
// hang indefinitely after tab visibility changes / token refreshes.
async function fetchProfileDirect(userId, accessToken) {
  const ctrl = new AbortController();
  const killer = setTimeout(() => ctrl.abort(), QUERY_TIMEOUT_MS);
  try {
    const url = `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`;
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${accessToken || SUPABASE_ANON}`,
        Accept: 'application/json',
      },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`profiles ${r.status}`);
    const arr = await r.json();
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  } finally {
    clearTimeout(killer);
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);

  // Track the user we are *currently* fetching a profile for, so async
  // races (visibility refetch, token refresh) don't overwrite each other.
  const reqIdRef = useRef(0);
  const lastUserIdRef = useRef(null);
  const mountedRef = useRef(true);

  const loadProfile = useCallback(async (userId, accessToken) => {
    if (!userId) return;
    const myId = ++reqIdRef.current;
    try {
      const data = await fetchProfileDirect(userId, accessToken);
      if (!mountedRef.current || myId !== reqIdRef.current) return;
      if (data) {
        setProfile(data);
        setProfileMissing(false);
      } else {
        setProfileMissing(true);
      }
    } catch (e) {
      if (!mountedRef.current || myId !== reqIdRef.current) return;
      // eslint-disable-next-line no-console
      console.warn('[auth] loadProfile failed:', e?.message || e);
      setProfileMissing(true);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let bootDone = false;

    const finishBoot = () => {
      if (bootDone) return;
      bootDone = true;
      if (mountedRef.current) setLoading(false);
    };

    // Watchdog: never let the splash hang forever.
    const watchdog = setTimeout(finishBoot, BOOT_TIMEOUT_MS);

    // Fire-and-forget initial session read. We don't await because
    // onAuthStateChange will fire INITIAL_SESSION immediately.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mountedRef.current) return;
        const s = data?.session || null;
        if (s) {
          lastUserIdRef.current = s.user.id;
          setSession(s);
          loadProfile(s.user.id, s.access_token);
        }
        finishBoot();
      })
      .catch(() => finishBoot());

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!mountedRef.current) return;
      const newUserId = s?.user?.id || null;
      const userChanged = newUserId !== lastUserIdRef.current;

      lastUserIdRef.current = newUserId;
      setSession(s || null);

      if (!s?.user) {
        // Signed out
        setProfile(null);
        setProfileMissing(false);
        reqIdRef.current++;
      } else if (userChanged || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        // Reset profile only on real user/session changes (NOT on TOKEN_REFRESHED).
        setProfile(null);
        setProfileMissing(false);
        // Defer to next microtask to avoid Supabase deadlocks inside the callback.
        setTimeout(() => {
          if (mountedRef.current) loadProfile(s.user.id, s.access_token);
        }, 0);
      }

      finishBoot();
    });

    // Re-fetch profile when tab returns to foreground (in case fetch got
    // suspended). Only if we are signed-in and don't have a profile yet.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!mountedRef.current) return;
      const uid = lastUserIdRef.current;
      if (!uid) return;
      // If we already have a profile, do nothing (don't disturb).
      // If we don't, refresh the session token and retry.
      if (profile && !profileMissing) return;
      supabase.auth.getSession().then(({ data }) => {
        const tok = data?.session?.access_token;
        if (mountedRef.current) loadProfile(uid, tok);
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      mountedRef.current = false;
      clearTimeout(watchdog);
      sub.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProfile]);

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    // Optimistic local clear so UI flips instantly.
    reqIdRef.current++;
    lastUserIdRef.current = null;
    setSession(null);
    setProfile(null);
    setProfileMissing(false);
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch {}
    window.location.replace('/login');
  }

  async function retryLoadProfile() {
    setProfileMissing(false);
    if (session?.user) {
      await loadProfile(session.user.id, session.access_token);
    } else {
      // Try to recover the session.
      const { data } = await supabase.auth.getSession();
      const s = data?.session;
      if (s?.user) {
        lastUserIdRef.current = s.user.id;
        setSession(s);
        await loadProfile(s.user.id, s.access_token);
      }
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
