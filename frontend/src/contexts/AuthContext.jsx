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
        console.warn('[auth] loadProfile error:', error);
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

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive) return;
        setSession(data.session || null);
        if (data.session?.user) await loadProfile(data.session.user.id);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_ev, s) => {
      if (!alive) return;
      setSession(s || null);
      if (s?.user) await loadProfile(s.user.id);
      else setProfile(null);
    });

    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }
  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
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
