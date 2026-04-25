// Web Push subscription helper — saves the browser PushSubscription
// to the `push_subscriptions` Supabase table. The Edge Function
// "send-push" reads this table and dispatches notifications when a
// new row is inserted in `notifications` (via Database Webhook).

import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    !!VAPID_PUBLIC_KEY
  );
}

export async function getPushPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  // ready waits until a SW is active.
  return navigator.serviceWorker.ready;
}

export async function getCurrentPushSubscription() {
  const reg = await getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

async function saveSubscriptionInDB(userId, sub) {
  const json = sub.toJSON();
  const row = {
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    user_agent: navigator.userAgent,
  };
  // Upsert by (user_id, endpoint).
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(row, { onConflict: 'user_id,endpoint' });
  if (error) throw error;
}

export async function subscribeToPush(userId) {
  if (!isPushSupported()) throw new Error('Web Push no soportado en este navegador');
  if (!userId) throw new Error('Usuario no autenticado');

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Permiso de notificaciones denegado');

  const reg = await getRegistration();
  if (!reg) throw new Error('Service Worker no disponible');

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await saveSubscriptionInDB(userId, sub);
  try { localStorage.setItem('alfatwin_push_on', '1'); } catch {}
  return sub;
}

export async function unsubscribeFromPush(userId) {
  const sub = await getCurrentPushSubscription();
  if (sub) {
    const ep = sub.endpoint;
    try { await sub.unsubscribe(); } catch {}
    if (userId) {
      try {
        await supabase.from('push_subscriptions').delete().match({ user_id: userId, endpoint: ep });
      } catch {}
    }
  }
  try { localStorage.setItem('alfatwin_push_on', '0'); } catch {}
}

// Listen for SW asking to re-subscribe (e.g. token rotation).
export function attachResubscribeListener(userId) {
  if (!('serviceWorker' in navigator)) return () => {};
  const handler = (e) => {
    if (e.data?.type === 'PUSH_RESUBSCRIBE_NEEDED' && userId) {
      subscribeToPush(userId).catch(() => {});
    }
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}
