import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getHighAccuracyPosition, reverseGeocode, getDeviceInfo } from '../../lib/gps';
import { ArrowLeft, Crosshair, CheckCircle2, Loader2, LogIn as InIcon, LogOut as OutIcon, AlertTriangle, MapPin, Radio } from 'lucide-react';
import { toast } from 'sonner';
import { sendNotificationBulk } from '../../hooks/useNotifications';
import { hasAnsweredLocationSharing, setLocationSharingEnabled } from '../../hooks/useLocationTracker';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';

export default function ClockIn() {
  const { user, profile } = useAuth();
  const { state } = useLocation();
  const nav = useNavigate();
  const tipo = state?.tipo || 'entrada';
  const [pos, setPos] = useState(null);
  const [address, setAddress] = useState('');
  // idle (user must tap) | acquiring | ready | saving | done | error
  const [phase, setPhase] = useState('idle');
  const [samples, setSamples] = useState(0);
  const [err, setErr] = useState(null);
  const [askShare, setAskShare] = useState(false);

  // iOS / iPhone requires a user gesture to request geolocation from a PWA.
  // So we DO NOT start watching until the user taps the button below.
  async function startTracking() {
    setPhase('acquiring');
    setErr(null);
    try {
      const first = await getHighAccuracyPosition({ timeout: 20000 });
      setPos(first);
      setSamples(1);
    } catch (e) {
      setErr(e.message || 'Permiso denegado o GPS deshabilitado');
      setPhase('error');
      return;
    }
    // keep refining every 5s
    const int = setInterval(async () => {
      try {
        const p = await getHighAccuracyPosition({ timeout: 15000 });
        setPos(p);
        setSamples((s) => s + 1);
      } catch {
        /* keep previous */
      }
    }, 5000);
    // store interval id on the window for cleanup
    window.__clockin_int = int;
  }

  useEffect(() => {
    return () => { if (window.__clockin_int) { clearInterval(window.__clockin_int); window.__clockin_int = null; } };
  }, []);

  useEffect(() => {
    if (!pos || phase === 'ready' || phase === 'saving' || phase === 'done') return;
    if (pos.coords.accuracy <= 60) {
      setPhase('ready');
      if (!address) reverseGeocode(pos.coords.latitude, pos.coords.longitude).then(setAddress);
    }
  }, [pos, address, phase]);

  async function mark() {
    if (!pos) return;
    setPhase('saving');
    try {
      const payload = {
        user_id: user.id,
        tipo,
        latitud: pos.coords.latitude,
        longitud: pos.coords.longitude,
        precision_m: pos.coords.accuracy,
        direccion_geolocalizada: address,
        dispositivo_info: getDeviceInfo(),
        fake_gps_detected: false,
      };
      const { error } = await supabase.from('marks').insert(payload);
      if (error) throw error;

      try {
        await supabase.from('live_positions').upsert({
          user_id: user.id,
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          precision_m: pos.coords.accuracy,
          updated_at: new Date().toISOString(),
        });
      } catch {}

      const { data: admins } = await supabase.from('profiles').select('id').eq('rol', 'admin').eq('activo', true);
      if (admins?.length) {
        await sendNotificationBulk(admins.map((a) => a.id), {
          tipo: 'marcacion',
          titulo: `${profile.nombre} marcó ${tipo}`,
          mensaje: address || 'Ubicación registrada',
          link: '/admin',
        });
      }
      if (window.__clockin_int) { clearInterval(window.__clockin_int); window.__clockin_int = null; }
      setPhase('done');
      toast.success(`Marcación de ${tipo} registrada`);
      // First-time: ask for background location consent AFTER successful mark.
      if (tipo === 'entrada' && !hasAnsweredLocationSharing()) {
        setTimeout(() => setAskShare(true), 700);
      } else {
        setTimeout(() => nav('/app'), 1500);
      }
    } catch (e) {
      toast.error(e.message || 'Error');
      setPhase('ready');
    }
  }

  const lowPrecisionAvailable = samples >= 3 && pos && pos.coords.accuracy > 60;

  return (
    <div className="max-w-md mx-auto" data-testid="clockin-page">
      <button onClick={() => nav(-1)} className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> Volver
      </button>

      <div className="card-premium p-6 text-center fade-up">
        <p className="label-eyebrow">Marcación</p>
        <h1 className="text-3xl font-black tracking-tight mt-1 mb-6">
          {tipo === 'entrada' ? 'Registrar entrada' : 'Registrar salida'}
        </h1>

        {phase === 'idle' && (
          <div>
            <div className="mx-auto w-36 h-36 rounded-full grid place-items-center bg-gold/10 border border-gold/30">
              <MapPin className="w-14 h-14 text-gold" />
            </div>
            <p className="mt-5 text-lg font-bold">Activar ubicación</p>
            <p className="text-sm text-zinc-400 mt-1 font-light">
              Toca el botón y concede permiso al GPS de tu teléfono para continuar.
            </p>
            <button
              onClick={startTracking}
              className="btn-gold mt-6 w-full h-14 text-lg flex items-center justify-center gap-2"
              data-testid="request-location-button"
            >
              <MapPin className="w-5 h-5" /> Obtener mi ubicación
            </button>
            <p className="text-[11px] text-zinc-500 mt-3">
              En iPhone la primera vez aparece un diálogo pidiendo permiso al GPS.
            </p>
          </div>
        )}

        {phase === 'acquiring' && (
          <div className="py-8">
            <div className="relative mx-auto w-36 h-36 grid place-items-center">
              <span className="absolute inset-0 rounded-full bg-gold/10 animate-ping" />
              <span className="absolute inset-4 rounded-full bg-gold/20 animate-pulse" />
              <Crosshair className="w-12 h-12 text-gold relative" />
            </div>
            <p className="mt-6 font-bold text-lg">Afinando precisión GPS…</p>
            <p className="text-sm text-zinc-500 mt-1">
              Precisión actual: {pos?.coords?.accuracy ? `${Math.round(pos.coords.accuracy)} m` : 'detectando'}
            </p>
            <p className="text-[11px] text-zinc-600 mt-1">Muestras: {samples}</p>

            {lowPrecisionAvailable && (
              <button
                onClick={mark}
                data-testid="mark-lowprec-button"
                className="btn-ghost mt-6"
              >
                Marcar igualmente (precisión aprox.)
              </button>
            )}
          </div>
        )}

        {phase === 'ready' && (
          <div>
            <div className="mx-auto w-36 h-36 rounded-full grid place-items-center bg-green-500/15 border border-green-500/30">
              <CheckCircle2 className="w-14 h-14 text-green-400" />
            </div>
            <p className="mt-5 text-lg font-bold">Ubicación lista</p>
            <p className="text-xs text-zinc-500">Precisión: {Math.round(pos.coords.accuracy)} m</p>
            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{address || 'Obteniendo dirección…'}</p>
            <button onClick={mark} data-testid="confirm-mark-button" className="btn-gold mt-6 w-full h-14 text-lg flex items-center justify-center gap-2">
              {tipo === 'entrada' ? <InIcon className="w-5 h-5" /> : <OutIcon className="w-5 h-5" />} Confirmar {tipo}
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div>
            <div className="mx-auto w-36 h-36 rounded-full grid place-items-center bg-red-500/15 border border-red-500/30">
              <AlertTriangle className="w-14 h-14 text-red-400" />
            </div>
            <p className="mt-5 text-lg font-bold text-red-400">No se pudo obtener ubicación</p>
            <p className="text-sm text-zinc-400 mt-1">{err}</p>
            <p className="text-xs text-zinc-500 mt-3">
              En iPhone: <br />Ajustes → Safari → Ubicación → Permitir.<br />
              También revisa Ajustes → Privacidad → Localización → Safari → Mientras se use.
            </p>
            <button onClick={() => { setPhase('idle'); setErr(null); setPos(null); setSamples(0); }} data-testid="retry-mark-button" className="btn-gold mt-6 w-full">
              Reintentar
            </button>
          </div>
        )}

        {phase === 'saving' && (
          <div className="py-14"><Loader2 className="w-10 h-10 animate-spin text-gold mx-auto" /><p className="mt-4 font-bold">Guardando marcación…</p></div>
        )}

        {phase === 'done' && (
          <div className="py-10">
            <CheckCircle2 className="w-14 h-14 text-green-400 mx-auto" />
            <p className="mt-3 text-lg font-bold">Marcación registrada</p>
          </div>
        )}
      </div>

      <Dialog open={askShare} onOpenChange={(o) => { if (!o) { setAskShare(false); setTimeout(() => nav('/app'), 300); } }}>
        <DialogContent className="bg-surface border-white/10 max-w-md" data-testid="location-consent-dialog">
          <DialogHeader>
            <div className="w-14 h-14 rounded-full bg-gold/15 text-gold grid place-items-center mb-3"><Radio className="w-6 h-6" /></div>
            <DialogTitle className="text-2xl font-black">¿Compartir ubicación en tiempo real?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-400 font-light">
            Si aceptas, tu ubicación se mostrará al administrador en el mapa del panel mientras la app esté abierta.
            Esto ayuda a coordinar tu jornada. Puedes cambiar esta preferencia en cualquier momento.
          </p>
          <p className="text-xs text-zinc-500 mt-2">Solo se comparte mientras la app está activa.</p>
          <DialogFooter className="!flex-col sm:!flex-row gap-2">
            <button
              onClick={() => { setLocationSharingEnabled(false); setAskShare(false); toast.message('Ubicación en vivo desactivada'); setTimeout(() => { nav('/app'); window.location.reload(); }, 400); }}
              className="btn-ghost w-full sm:w-auto"
              data-testid="consent-deny"
            >No, solo marcar</button>
            <button
              onClick={() => { setLocationSharingEnabled(true); setAskShare(false); toast.success('Ubicación en vivo activada'); setTimeout(() => { nav('/app'); window.location.reload(); }, 400); }}
              className="btn-gold w-full sm:w-auto flex items-center justify-center gap-2"
              data-testid="consent-accept"
            ><Radio className="w-4 h-4" /> Sí, compartir en vivo</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
