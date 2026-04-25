import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileMissing, setProfileMissing] = useState(false);
  const retriesRef = useRef(0);

  async function loadProfile(userId, { isRetry = false } = {}) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[auth] loadProfile error:', error.message);
        if (!isRetry && retriesRef.current < 2) {
          retriesRef.current += 1;
          setTimeout(() => loadProfile(userId, { isRetry: true }), 1200);
        } else {
          setProfileMissing(true);
        }
        return;
      }
      if (data) {
        setProfile(data);
        setProfileMissing(false);
        retriesRef.current = 0;
      } else if (!isRetry && retriesRef.current < 2) {
        retriesRef.current += 1;
        setTimeout(() => loadProfile(userId, { isRetry: true }), 1200);
      } else {
        setProfileMissing(true);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auth] loadProfile threw:', e);
      if (!isRetry && retriesRef.current < 2) {
        retriesRef.current += 1;
        setTimeout(() => loadProfile(userId, { isRetry: true }), 1200);
      } else {
        setProfileMissing(true);
      }
    }
  }

  useEffect(() => {
    let alive = true;
    const failsafe = setTimeout(() => { if (alive) setLoading(false); }, 9000);

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        const s = data?.session || null;
        setSession(s);
        if (s?.user) await loadProfile(s.user.id);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[auth] getSession error:', e);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_ev, s) => {
      if (!alive) return;
      setSession(s || null);
      retriesRef.current = 0;
      setProfileMissing(false);
      if (s?.user) {
        try { await loadProfile(s.user.id); } catch {}
      } else {
        setProfile(null);
      }
    });

    return () => {
      alive = false;
      clearTimeout(failsafe);
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    // 1. clear local state + storage FIRST so redirect never bounces back
    setSession(null);
    setProfile(null);
    setProfileMissing(false);
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    // 2. supabase sign-out with a hard 2s timeout
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    } catch {}
    // 3. navigate
    window.location.replace('/login');
  }

  async function retryLoadProfile() {
    retriesRef.current = 0;
    setProfileMissing(false);
    if (session?.user) await loadProfile(session.user.id);
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
    refreshProfile: () => session?.user && loadProfile(session.user.id),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
