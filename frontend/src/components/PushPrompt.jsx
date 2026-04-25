import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import {
  isPushSupported,
  getPushPermissionState,
  getCurrentPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  attachResubscribeListener,
} from '../lib/webpush';

const DISMISS_KEY = 'alfatwin_push_prompt_dismissed_at';
const REMIND_AFTER_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export default function PushPrompt() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    const off = attachResubscribeListener(user.id);
    return off;
  }, [user]);

  useEffect(() => {
    if (!user || !isPushSupported()) return;
    let cancelled = false;
    (async () => {
      const perm = await getPushPermissionState();
      if (perm === 'granted') {
        // Already granted: re-affirm subscription silently if missing.
        const sub = await getCurrentPushSubscription();
        if (!sub) {
          try { await subscribeToPush(user.id); } catch {}
        }
        return;
      }
      if (perm === 'denied') return;
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < REMIND_AFTER_MS) return;
      // Delay 1.5s so we don't slam the user on first paint.
      setTimeout(() => { if (!cancelled) setShow(true); }, 1500);
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function activate() {
    if (!user) return;
    setBusy(true);
    try {
      await subscribeToPush(user.id);
      toast.success('Notificaciones activadas');
      setShow(false);
    } catch (e) {
      toast.error(e.message || 'No se pudo activar');
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShow(false);
  }

  if (!show) return null;
  return (
    <div
      className="fixed bottom-4 inset-x-4 md:bottom-6 md:right-6 md:left-auto md:max-w-sm z-50 fade-up"
      data-testid="push-prompt"
    >
      <div className="card-premium p-4 flex gap-3 items-start shadow-2xl border-gold/30">
        <div className="w-10 h-10 rounded-xl bg-gold/15 text-gold grid place-items-center shrink-0">
          <Bell className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black tracking-tight">Activar notificaciones</p>
          <p className="text-xs text-zinc-400 mt-0.5">
            Recibe alertas en tiempo real aunque tengas la app cerrada (tareas, mensajes y recordatorios).
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={activate}
              disabled={busy}
              className="btn-gold !px-4 !py-2 !text-xs flex items-center gap-2"
              data-testid="push-prompt-activate"
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
              Activar
            </button>
            <button
              onClick={dismiss}
              className="btn-ghost !px-3 !py-2 !text-xs"
              data-testid="push-prompt-dismiss"
            >
              Después
            </button>
          </div>
        </div>
        <button onClick={dismiss} className="text-zinc-500 hover:text-white" aria-label="Cerrar">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/** Small toggle for the Config screen / settings. */
export function PushToggle() {
  const { user } = useAuth();
  const [state, setState] = useState({ enabled: false, perm: 'default', loading: true });
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!isPushSupported()) {
      setState({ enabled: false, perm: 'unsupported', loading: false });
      return;
    }
    const perm = await getPushPermissionState();
    const sub = await getCurrentPushSubscription();
    setState({ enabled: !!sub && perm === 'granted', perm, loading: false });
  }

  useEffect(() => { refresh(); }, [user?.id]);

  async function toggle() {
    if (!user) return;
    setBusy(true);
    try {
      if (state.enabled) {
        await unsubscribeFromPush(user.id);
        toast.success('Notificaciones desactivadas en este dispositivo');
      } else {
        await subscribeToPush(user.id);
        toast.success('Notificaciones activadas en este dispositivo');
      }
      await refresh();
    } catch (e) {
      toast.error(e.message || 'Error');
    } finally { setBusy(false); }
  }

  if (state.loading) return null;
  if (state.perm === 'unsupported') {
    return <p className="text-xs text-zinc-500">Tu navegador no soporta notificaciones push.</p>;
  }
  if (state.perm === 'denied') {
    return <p className="text-xs text-yellow-400">Las notificaciones están bloqueadas. Habilítalas desde los ajustes del navegador para esta web.</p>;
  }
  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-all ${state.enabled ? 'bg-green-500/15 text-green-300 border-green-500/30' : 'bg-white/5 text-zinc-300 border-white/10 hover:border-gold/40'}`}
      data-testid="push-toggle"
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : state.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
      {state.enabled ? 'Notificaciones activas' : 'Activar notificaciones'}
    </button>
  );
}
