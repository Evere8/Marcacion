import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

// Safe realtime subscription that works with React 19 Strict Mode double-mount.
// Usage:
//   useRealtime('name', (ch) => ch.on('postgres_changes', {...}, cb), [deps])
export function useRealtime(baseName, attach, deps = []) {
  const subRef = useRef(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Build a UNIQUE channel name per mount so Strict Mode's double-run
    // never tries to mutate an already-subscribed channel.
    const name = `${baseName}_${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(name);
    try { attach(ch); } catch (e) { /* noop */ }
    ch.subscribe();
    subRef.current = ch;
    return () => {
      try { supabase.removeChannel(ch); } catch (e) { /* noop */ }
      subRef.current = null;
    };
  }, deps);
}
