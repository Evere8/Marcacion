import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('[auth] loadProfile error:', error.message);
        setProfile(null);
        return;
      }
      setProfile(data || null);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[auth] loadProfile threw:', e);
      setProfile(null);
    }
  }

  useEffect(() => {
    let alive = true;

    // Failsafe: guarantee we NEVER get stuck on "Cargando…"
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
    try { await supabase.auth.signOut(); } catch {}
    setSession(null);
    setProfile(null);
    // Hard-reset to login to avoid any stuck state
    window.location.replace('/login');
  }

  const value = {
    session,
    profile,
    user: session?.user || null,
    loading,
    signIn,
    signOut,
    refreshProfile: () => session?.user && loadProfile(session.user.id),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
