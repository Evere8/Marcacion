import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

const PARAGUAY_TZ = 'America/Asuncion';
const REMINDER_BEFORE_MIN = 10; // remind 10 min before
const REMINDER_AFTER_MIN = 5;   // remind 5 min after if not yet clocked
const SHOWN_KEY = 'alfatwin_reminder_shown';

function paraguayHHMM() {
  return new Date().toLocaleTimeString('es-ES', {
    timeZone: PARAGUAY_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function paraguayDateKey() {
  return new Date().toLocaleDateString('en-CA', { timeZone: PARAGUAY_TZ });
}

function diffMinutes(targetHHMM, nowHHMM) {
  const [th, tm] = targetHHMM.split(':').map(Number);
  const [nh, nm] = nowHHMM.split(':').map(Number);
  return (th * 60 + tm) - (nh * 60 + nm);
}

function getShown() {
  try { return JSON.parse(localStorage.getItem(SHOWN_KEY) || '{}'); } catch { return {}; }
}
function markShown(key) {
  const s = getShown();
  s[key] = true;
  try { localStorage.setItem(SHOWN_KEY, JSON.stringify(s)); } catch {}
}
function resetShownIfNewDay() {
  const today = paraguayDateKey();
  const s = getShown();
  if (s.__date !== today) {
    try { localStorage.setItem(SHOWN_KEY, JSON.stringify({ __date: today })); } catch {}
  }
}

function fireLocalNotification(title, body, link) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  try {
    if (navigator.serviceWorker?.ready) {
      navigator.serviceWorker.ready.then((reg) =>
        reg.showNotification(title, {
          body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png',
          data: { link: link || '/app/marcar' }, tag: title,
        })
      );
    } else {
      new Notification(title, { body, icon: '/icons/icon-192.png' });
    }
  } catch {}
}

/**
 * Watches schedule + today's marks. While the staff tab is open / PWA running,
 * fires a local OS notification 10 min before and 5 min after entrada/salida
 * if the user hasn't clocked yet.
 */
export function useClockInReminder({ userId, hasEntrada, hasSalida }) {
  const cfgRef = useRef({ entrada: '08:00', salida: '17:00' });
  const stateRef = useRef({ hasEntrada, hasSalida });

  useEffect(() => { stateRef.current = { hasEntrada, hasSalida }; }, [hasEntrada, hasSalida]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase.from('attendance_config').select('*').limit(1).maybeSingle();
      if (cancelled) return;
      if (data) {
        cfgRef.current = {
          entrada: data.hora_entrada?.slice(0, 5) || '08:00',
          salida: data.hora_salida?.slice(0, 5) || '17:00',
        };
      }
    })();

    function tick() {
      resetShownIfNewDay();
      const now = paraguayHHMM();
      const shown = getShown();
      const today = paraguayDateKey();

      const checks = [
        { type: 'entrada', target: cfgRef.current.entrada, has: stateRef.current.hasEntrada },
        { type: 'salida', target: cfgRef.current.salida, has: stateRef.current.hasSalida },
      ];

      for (const c of checks) {
        if (c.has) continue;
        const delta = diffMinutes(c.target, now);
        // Pre-reminder: between -10 and 0 minutes before
        if (delta <= REMINDER_BEFORE_MIN && delta > 0) {
          const k = `${today}_pre_${c.type}`;
          if (!shown[k]) {
            markShown(k);
            fireLocalNotification(
              `Faltan ${delta} min para tu ${c.type}`,
              `No olvides marcar tu ${c.type} a las ${c.target}.`,
              '/app/marcar'
            );
          }
        }
        // Late reminder: 5 min after target and not clocked
        if (delta <= -REMINDER_AFTER_MIN) {
          const k = `${today}_late_${c.type}`;
          if (!shown[k]) {
            markShown(k);
            fireLocalNotification(
              `Recordatorio: marca tu ${c.type}`,
              `Ya pasó la hora de ${c.target}. Marca cuanto antes.`,
              '/app/marcar'
            );
          }
        }
      }
    }

    tick();
    const id = setInterval(tick, 60_000); // every minute
    return () => { cancelled = true; clearInterval(id); };
  }, [userId]);
}
