import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { Clock, AlertTriangle, MapPin, UserX, ClipboardList, BellRing, LogIn as InIcon, LogOut as OutIcon, Activity } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { formatTime, minutesToText, todayISO } from '../../lib/format';
import { sendNotification, sendNotificationBulk } from '../../hooks/useNotifications';
import { toast } from 'sonner';

const goldIcon = L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;background:#D4AF37;border:2px solid #050505;border-radius:50%;box-shadow:0 0 0 4px rgba(212,175,55,0.35);"></div>`,
  iconSize: [22, 22], iconAnchor: [11, 11],
});

export default function Dashboard() {
  const [marks, setMarks] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState(null);

  async function loadAll() {
    const today = todayISO();
    const [m, p, t] = await Promise.all([
      supabase.from('marks').select('*, profiles:user_id(nombre,foto_perfil,email)').eq('fecha', today).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('activo', true),
      supabase.from('tasks').select('*, assignee:assignee_id(nombre)').order('created_at', { ascending: false }).limit(30),
    ]);
    setMarks(m.data || []);
    setPersonal(p.data || []);
    setTasks(t.data || []);
  }

  useEffect(() => { loadAll(); }, []);
  useRealtime('dash_marks', (ch) => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'marks' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, loadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadAll);
  }, []);

  const sinMarcar = useMemo(() => {
    const today = marks.filter((m) => m.tipo === 'entrada').map((m) => m.user_id);
    return personal.filter((p) => p.rol === 'personal' && !today.includes(p.id));
  }, [marks, personal]);

  const atrasos = useMemo(() => {
    const agg = {};
    for (const m of marks) {
      const key = m.user_id;
      if (!agg[key]) agg[key] = { nombre: m.profiles?.nombre || '—', entrada: 0, salida: 0 };
      if (m.tipo === 'entrada') agg[key].entrada = Math.max(agg[key].entrada, m.retraso_minutos || 0);
      else agg[key].salida = Math.max(agg[key].salida, m.retraso_minutos || 0);
    }
    return Object.entries(agg).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.entrada - a.entrada);
  }, [marks]);

  const mapCenter = marks.find((m) => m.latitud)
    ? [marks.find((m) => m.latitud).latitud, marks.find((m) => m.latitud).longitud]
    : [-16.5, -68.15];

  async function enviarAvisoIndividual(user_id, nombre) {
    await sendNotification(user_id, {
      tipo: 'alerta',
      titulo: 'Recordatorio de marcación',
      mensaje: `Hola ${nombre}, por favor marca tu entrada cuanto antes.`,
      link: '/app/marcar',
    });
    toast.success(`Aviso enviado a ${nombre}`);
  }
  async function enviarAvisoGeneral() {
    await sendNotificationBulk(sinMarcar.map((p) => p.id), {
      tipo: 'alerta',
      titulo: 'Recordatorio de marcación',
      mensaje: 'Por favor marca tu entrada cuanto antes.',
      link: '/app/marcar',
    });
    toast.success(`Aviso enviado a ${sinMarcar.length} empleados`);
  }

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      {/* KPIs */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={InIcon} label="Entradas hoy" value={marks.filter(m => m.tipo === 'entrada').length} testId="kpi-entradas" />
        <KPI icon={OutIcon} label="Salidas hoy" value={marks.filter(m => m.tipo === 'salida').length} testId="kpi-salidas" />
        <KPI icon={UserX} label="Sin marcar" value={sinMarcar.length} accent testId="kpi-sinmarcar" />
        <KPI icon={Activity} label="Personal activo" value={personal.filter(p => p.rol === 'personal').length} testId="kpi-personal" />
      </section>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* LIVE MAP */}
        <div className="card-premium lg:col-span-2 p-0 overflow-hidden fade-up">
          <div className="flex items-center justify-between p-5 border-b border-white/5">
            <div><p className="label-eyebrow mb-1">Ubicación en vivo</p><h2 className="text-lg font-black">Marcaciones de hoy</h2></div>
            <Badge className="bg-gold/15 text-gold border border-gold/30 uppercase tracking-wider">Tiempo real</Badge>
          </div>
          <div className="h-[420px]">
            <MapContainer center={mapCenter} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; CARTO &copy; OpenStreetMap' />
              {marks.filter((m) => m.latitud).map((m) => (
                <Marker key={m.id} position={[m.latitud, m.longitud]} icon={goldIcon} eventHandlers={{ click: () => setSelected(m) }}>
                  <Popup>
                    <div className="space-y-1">
                      <p className="font-bold text-white">{m.profiles?.nombre}</p>
                      <p className="text-xs text-zinc-400">{m.tipo === 'entrada' ? 'Entrada' : 'Salida'} · {formatTime(m.hora)}</p>
                      <p className="text-[11px] text-zinc-500">{m.direccion_geolocalizada}</p>
                      {m.fake_gps_detected && <p className="text-red-400 text-xs font-bold">⚠ GPS sospechoso</p>}
                    </div>
                  </Popup>
                </Marker>
              ))}
              {selected && (<CircleMarker center={[selected.latitud, selected.longitud]} radius={14} pathOptions={{ color: '#D4AF37' }} />)}
            </MapContainer>
          </div>
        </div>

        {/* LIVE LIST */}
        <div className="card-premium p-5 fade-up" data-testid="live-marks-list">
          <div className="flex items-center justify-between mb-4">
            <div><p className="label-eyebrow">Actividad</p><h2 className="text-lg font-black">Marcaciones hoy</h2></div>
            <Activity className="w-4 h-4 text-gold" />
          </div>
          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {marks.length === 0 && <p className="text-zinc-500 text-sm py-6 text-center">Aún no hay marcaciones hoy.</p>}
            {marks.map((m) => (
              <button key={m.id} className="w-full text-left flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
                onClick={() => setSelected(m)} data-testid={`mark-item-${m.id}`}>
                <div className={`w-9 h-9 rounded-xl grid place-items-center ${m.tipo === 'entrada' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'}`}>
                  {m.tipo === 'entrada' ? <InIcon className="w-4 h-4" /> : <OutIcon className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{m.profiles?.nombre}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{formatTime(m.hora)} · {m.direccion_geolocalizada || 'Ubicación'}</p>
                </div>
                {m.fake_gps_detected ? (
                  <Badge className="bg-red-500/15 text-red-400 border border-red-500/30 uppercase text-[10px]">Fake</Badge>
                ) : m.retraso_minutos > 0 ? (
                  <Badge className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 uppercase text-[10px]">+{minutesToText(m.retraso_minutos)}</Badge>
                ) : (
                  <Badge className="bg-green-500/15 text-green-400 border border-green-500/30 uppercase text-[10px]">A tiempo</Badge>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* SIN MARCAR */}
        <div className="card-premium p-5 fade-up" data-testid="sin-marcar-list">
          <div className="flex items-center justify-between mb-4">
            <div><p className="label-eyebrow">Pendientes</p><h2 className="text-lg font-black">Sin marcar</h2></div>
            <UserX className="w-4 h-4 text-red-400" />
          </div>
          {sinMarcar.length > 0 && (
            <button onClick={enviarAvisoGeneral} className="btn-gold w-full mb-3 flex items-center justify-center gap-2" data-testid="send-general-alert-button">
              <BellRing className="w-4 h-4" /> Aviso general
            </button>
          )}
          <div className="space-y-2 max-h-[280px] overflow-auto">
            {sinMarcar.length === 0 && <p className="text-zinc-500 text-sm py-4 text-center">Todos marcaron 🎯</p>}
            {sinMarcar.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5">
                <Avatar src={p.foto_perfil} name={p.nombre} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{p.nombre}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{p.email}</p>
                </div>
                <button className="btn-ghost !px-3 !py-1.5 !text-xs" onClick={() => enviarAvisoIndividual(p.id, p.nombre)}
                  data-testid={`send-alert-${p.id}`}>Avisar</button>
              </div>
            ))}
          </div>
        </div>

        {/* ATRASOS */}
        <div className="card-premium p-5 fade-up" data-testid="atrasos-list">
          <div className="flex items-center justify-between mb-4">
            <div><p className="label-eyebrow">Desempeño</p><h2 className="text-lg font-black">Atrasos del día</h2></div>
            <Clock className="w-4 h-4 text-yellow-400" />
          </div>
          <div className="space-y-2 max-h-[280px] overflow-auto">
            {atrasos.length === 0 && <p className="text-zinc-500 text-sm py-4 text-center">Sin datos.</p>}
            {atrasos.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5">
                <div className="flex-1 min-w-0"><p className="text-sm font-bold text-white truncate">{a.nombre}</p></div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={`px-2 py-1 rounded-md ${a.entrada > 0 ? 'bg-yellow-500/15 text-yellow-400' : 'bg-green-500/15 text-green-400'}`}>E: {a.entrada > 0 ? `+${a.entrada}m` : '✓'}</span>
                  <span className={`px-2 py-1 rounded-md ${a.salida > 0 ? 'bg-blue-500/15 text-blue-400' : 'bg-zinc-500/15 text-zinc-400'}`}>S: {a.salida > 0 ? `+${a.salida}m` : '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* TAREAS URGENTES */}
        <div className="card-premium p-5 fade-up" data-testid="urgent-tasks">
          <div className="flex items-center justify-between mb-4">
            <div><p className="label-eyebrow">Prioridad</p><h2 className="text-lg font-black">Tareas urgentes</h2></div>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="space-y-2 max-h-[280px] overflow-auto">
            {tasks.filter(t => t.estado !== 'completada').slice(0, 10).map((t) => (
              <div key={t.id} className="p-3 rounded-xl hover:bg-white/5">
                <div className="flex items-center gap-2">
                  <UrgencyDot u={t.urgencia} />
                  <p className="text-sm font-bold text-white truncate flex-1">{t.titulo}</p>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 truncate">→ {t.assignee?.nombre || '—'}</p>
              </div>
            ))}
            {tasks.length === 0 && <p className="text-zinc-500 text-sm py-4 text-center">Sin tareas activas.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ icon: I, label, value, accent, testId }) {
  return (
    <div className={`card-premium p-5 fade-up ${accent ? 'ring-1 ring-red-500/20' : ''}`} data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="label-eyebrow">{label}</p>
        <div className={`w-9 h-9 rounded-xl grid place-items-center ${accent ? 'bg-red-500/15 text-red-400' : 'bg-gold/15 text-gold'}`}><I className="w-4 h-4" /></div>
      </div>
      <p className="text-4xl md:text-5xl font-black tracking-tighter mt-3 gold-gradient-text">{value}</p>
    </div>
  );
}

function UrgencyDot({ u }) {
  const c = u === 'rojo' ? 'bg-red-500' : u === 'amarillo' ? 'bg-yellow-400' : 'bg-green-500';
  return <span className={`w-2.5 h-2.5 rounded-full ${c}`} />;
}

export function Avatar({ src, name, size = 36 }) {
  if (src) return <img src={src} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className="rounded-full grid place-items-center bg-gold/15 text-gold font-black text-sm" style={{ width: size, height: size }}>{initials}</div>;
}
