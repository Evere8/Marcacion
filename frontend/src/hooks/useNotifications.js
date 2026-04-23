import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useRealtime } from './useRealtime';

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const mountedRef = useRef(true);
  const unread = items.filter(i => !i.leido).length;

  useEffect(() => {
    mountedRef.current = true;
    if (!user) return;
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => { if (mountedRef.current) setItems(data || []); });
    return () => { mountedRef.current = false; };
  }, [user]);

  useRealtime(
    user ? `notifs_${user.id}` : 'notifs_none',
    (ch) => {
      if (!user) return;
      ch.on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setItems((prev) => [payload.new, ...prev]);
          showBrowserNotification(payload.new);
        }
      );
    },
    [user?.id]
  );

  async function markRead(id) {
    await supabase.from('notifications').update({ leido: true }).eq('id', id);
    setItems((p) => p.map((n) => (n.id === id ? { ...n, leido: true } : n)));
  }
  async function markAllRead() {
    if (!user) return;
    await supabase.from('notifications').update({ leido: true }).eq('user_id', user.id).eq('leido', false);
    setItems((p) => p.map((n) => ({ ...n, leido: true })));
  }

  return { items, unread, markRead, markAllRead };
}

export function showBrowserNotification(n) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then((reg) =>
        reg.showNotification(n.titulo || 'ALFATWIN', {
          body: n.mensaje || '',
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          tag: n.id,
          data: { link: n.link },
        })
      );
    } else {
      new Notification(n.titulo || 'ALFATWIN', { body: n.mensaje || '', icon: '/icons/icon-192.png' });
    }
  } catch (e) { /* noop */ }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    return Notification.requestPermission();
  }
  return Notification.permission;
}

export async function sendNotification(user_id, { tipo, titulo, mensaje, link }) {
  return supabase.from('notifications').insert({ user_id, tipo, titulo, mensaje, link });
}

export async function sendNotificationBulk(user_ids, payload) {
  const rows = user_ids.map((uid) => ({ user_id: uid, ...payload }));
  return supabase.from('notifications').insert(rows);
}
