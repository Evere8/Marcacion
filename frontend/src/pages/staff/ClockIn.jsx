import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { detectFakeGPS, getHighAccuracyPosition, reverseGeocode, getDeviceInfo } from '../../lib/gps';
import { ArrowLeft, Crosshair, ShieldAlert, CheckCircle2, Loader2, LogIn as InIcon, LogOut as OutIcon } from 'lucide-react';
import { toast } from 'sonner';
import { sendNotificationBulk } from '../../hooks/useNotifications';

export default function ClockIn() {
  const { user, profile } = useAuth();
  const { state } = useLocation();
  const nav = useNavigate();
  const tipo = state?.tipo || 'entrada';
  const [pos, setPos] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [fake, setFake] = useState(false);
  const [address, setAddress] = useState('');
  const [phase, setPhase] = useState('acquiring'); // acquiring | ready | blocked | saving | done
  const [samples, setSamples] = useState(0);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let active = true;
    async function tick() {
      try {
        const p = await getHighAccuracyPosition({ timeout: 12000 });
        if (!active) return;
        setPos(p);
        setSamples((s) => s + 1);
      } catch (e) {
        if (!active) return;
        setErr(e.message || 'Geolocalización fallida');
        setPhase('blocked');
      }
    }
    tick();
    const int = setInterval(tick, 5000);
    return () => { active = false; clearInterval(int); };
  }, []);

  useEffect(() => {
    if (!pos) return;
    (async () => {
      const d = await detectFakeGPS(pos);
      setReasons(d.reasons);
      setFake(d.fake);
      if (d.fake) setPhase('blocked');
      else if (pos.coords.accuracy <= 40) {
        setPhase('ready');
        if (!address) reverseGeocode(pos.coords.latitude, pos.coords.longitude).then(setAddress);
      } else {
        setPhase('acquiring');
      }
    })();
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

      // Notify all admins
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

  async function logFakeAttempt() {
    try {
      // Insert a fake-flagged mark as audit trail (admin only will see via RLS).
      if (pos) {
        await supabase.from('marks').insert({
          user_id: user.id, tipo,
          latitud: pos.coords.latitude, longitud: pos.coords.longitude,
          precision_m: pos.coords.accuracy,
          direccion_geolocalizada: 'Intento bloqueado',
          dispositivo_info: getDeviceInfo(),
          fake_gps_detected: true,
        });
      }
      const { data: admins } = await supabase.from('profiles').select('id').eq('rol', 'admin').eq('activo', true);
      if (admins?.length) {
        await sendNotificationBulk(admins.map((a) => a.id), {
          tipo: 'alerta',
          titulo: `⚠ Intento de fake GPS: ${profile.nombre}`,
          mensaje: reasons.join(' · ') || 'Ubicación sospechosa',
          link: '/admin',
        });
      }
      toast.error('Marcación bloqueada y registrada');
    } catch {}
  }

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
            <p className="text-[11px] text-zinc-600 mt-1">Muestras: {samples} · Necesitamos ≤ 40 m</p>
          </div>
        )}

        {phase === 'ready' && (
          <div>
            <div className="mx-auto w-36 h-36 rounded-full grid place-items-center bg-green-500/15 border border-green-500/30">
              <CheckCircle2 className="w-14 h-14 text-green-400" />
            </div>
            <p className="mt-5 text-lg font-bold">Ubicación verificada</p>
            <p className="text-xs text-zinc-500">Precisión: {Math.round(pos.coords.accuracy)} m</p>
            <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{address || 'Obteniendo dirección…'}</p>
            <button onClick={mark} data-testid="confirm-mark-button" className="btn-gold mt-6 w-full h-14 text-lg flex items-center justify-center gap-2">
              {tipo === 'entrada' ? <InIcon className="w-5 h-5" /> : <OutIcon className="w-5 h-5" />} Confirmar {tipo}
            </button>
          </div>
        )}

        {phase === 'blocked' && (
          <div>
            <div className="mx-auto w-36 h-36 rounded-full grid place-items-center bg-red-500/15 border border-red-500/30">
              <ShieldAlert className="w-14 h-14 text-red-400" />
            </div>
            <p className="mt-5 text-lg font-bold text-red-400">Marcación bloqueada</p>
            <p className="text-sm text-zinc-400 mt-1">{err || 'Se detectaron indicios de GPS falso o imprecisión extrema.'}</p>
            {reasons.length > 0 && (
              <ul className="mt-3 text-[11px] text-zinc-500 text-left mx-auto max-w-xs list-disc list-inside">
                {reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            )}
            <button onClick={async () => { await logFakeAttempt(); nav('/app'); }} data-testid="blocked-notify-button"
              className="btn-ghost mt-6 w-full">Reintentar más tarde</button>
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
