import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { getHighAccuracyPosition, reverseGeocode, getDeviceInfo } from '../../lib/gps';
import { ArrowLeft, Crosshair, CheckCircle2, Loader2, LogIn as InIcon, LogOut as OutIcon, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { sendNotificationBulk } from '../../hooks/useNotifications';

export default function ClockIn() {
  const { user, profile } = useAuth();
  const { state } = useLocation();
  const nav = useNavigate();
  const tipo = state?.tipo || 'entrada';
  const [pos, setPos] = useState(null);
  const [address, setAddress] = useState('');
  const [phase, setPhase] = useState('acquiring'); // acquiring | ready | saving | done | error
  const [samples, setSamples] = useState(0);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let active = true;
    async function tick() {
      try {
        const p = await getHighAccuracyPosition({ timeout: 15000 });
        if (!active) return;
        setPos(p);
        setSamples((s) => s + 1);
      } catch (e) {
        if (!active) return;
        setErr(e.message || 'Geolocalización fallida');
        setPhase('error');
      }
    }
    tick();
    const int = setInterval(tick, 5000);
    return () => { active = false; clearInterval(int); };
  }, []);

  useEffect(() => {
    if (!pos) return;
    if (pos.coords.accuracy <= 50) {
      setPhase('ready');
      if (!address) reverseGeocode(pos.coords.latitude, pos.coords.longitude).then(setAddress);
    } else {
      setPhase('acquiring');
    }
  }, [pos, address]);

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

      // Also upsert live_positions so the admin map reflects it immediately.
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
      setPhase('done');
      toast.success(`Marcación de ${tipo} registrada`);
      setTimeout(() => nav('/app'), 1500);
    } catch (e) {
      toast.error(e.message || 'Error');
      setPhase('ready');
    }
  }

  // Allow marking even with low precision after several attempts.
  const canMarkLowPrecision = samples >= 3 && pos && pos.coords.accuracy > 50;

  return (
    <div className="max-w-md mx-auto" data-testid="clockin-page">
      <button onClick={() => nav(-1)} className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white mb-4"><ArrowLeft className="w-3.5 h-3.5" /> Volver</button>
      <div className="card-premium p-6 text-center fade-up">
        <p className="label-eyebrow">Marcación</p>
        <h1 className="text-3xl font-black tracking-tight mt-1 mb-6">{tipo === 'entrada' ? 'Registrar entrada' : 'Registrar salida'}</h1>

        {phase === 'acquiring' && (
          <div className="py-10">
            <div className="relative mx-auto w-36 h-36 grid place-items-center">
              <span className="absolute inset-0 rounded-full bg-gold/10 animate-ping" />
              <span className="absolute inset-4 rounded-full bg-gold/20 animate-pulse" />
              <Crosshair className="w-12 h-12 text-gold relative" />
            </div>
            <p className="mt-6 font-bold text-lg">Afinando precisión GPS…</p>
            <p className="text-sm text-zinc-500 mt-1">Precisión actual: {pos?.coords?.accuracy ? `${Math.round(pos.coords.accuracy)} m` : 'detectando'}</p>
            <p className="text-[11px] text-zinc-600 mt-1">Muestras: {samples}</p>

            {canMarkLowPrecision && (
              <button onClick={mark} data-testid="mark-lowprec-button" className="btn-ghost mt-6">
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
            <p className="text-xs text-zinc-500 mt-3">Activa el GPS y concede permisos de ubicación.</p>
            <button onClick={() => window.location.reload()} data-testid="retry-mark-button" className="btn-gold mt-6 w-full">Reintentar</button>
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
    </div>
  );
}
