import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { Clock, AlertTriangle, MapPin, UserX, ClipboardList, BellRing, LogIn as InIcon, LogOut as OutIcon, Activity, ExternalLink, CheckSquare, Plus, Repeat } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { formatTime, minutesToText, todayISO, computeMarkDelay } from '../../lib/format';
import { sendNotification, sendNotificationBulk, requestNotificationPermission } from '../../hooks/useNotifications';
import { mapsUrl } from '../../lib/gps';
import { toast } from 'sonner';

const goldIcon = L.divIcon({
  className: '',
  html: `<div style="width:22px;height:22px;background:#D4AF37;border:2px solid #050505;border-radius:50%;box-shadow:0 0 0 4px rgba(212,175,55,0.35);"></div>`,
  iconSize: [22, 22], iconAnchor: [11, 11],
});

export default function Dashboard() {
  const { user } = useAuth();
  const [marks, setMarks] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [cfg, setCfg] = useState({ hora_entrada: '08:00', hora_salida: '17:00', tolerancia_minutos: 10 });
  const [pendings, setPendings] = useState([]);

  useEffect(() => { requestNotificationPermission(); }, []);

  async function loadAll() {
    const today = todayISO();
    const safe = (p) => p.then((r) => r).catch(() => ({ data: [] }));
    const [m, p, t, c, ch] = await Promise.all([
      safe(supabase.from('marks').select('*, profiles:user_id(nombre,foto_perfil,email)').eq('fecha', today).order('created_at', { ascending: false })),
      safe(supabase.from('profiles').select('*').eq('activo', true)),
      safe(supabase.from('tasks').select('*, assignee:assignee_id(nombre)').order('created_at', { ascending: false }).limit(30)),
      safe(supabase.from('attendance_config').select('*').limit(1).maybeSingle()),
      user ? safe(supabase.from('checklists').select('*').eq('user_id', user.id).eq('fecha', today).eq('completado', false).order('created_at')) : Promise.resolve({ data: [] }),
    ]);
    setMarks(m.data || []);
    setPersonal(p.data || []);
    setTasks(t.data || []);
    setPendings(ch.data || []);
    if (c.data) setCfg({
      hora_entrada: c.data.hora_entrada?.slice(0, 5) || '08:00',
      hora_salida: c.data.hora_salida?.slice(0, 5) || '17:00',
      tolerancia_minutos: c.data.tolerancia_minutos ?? 10,
    });
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [user?.id]);
  useRealtime('dash_marks', (ch) => {
    const safeOn = (...args) => { try { ch.on(...args); } catch (e) { /* noop */ } };
    safeOn('postgres_changes', { event: '*', schema: 'public', table: 'marks' }, loadAll);
    safeOn('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, loadAll);
    safeOn('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadAll);
    safeOn('postgres_changes', { event: '*', schema: 'public', table: 'checklists' }, loadAll);
  }, []);

  const sinMarcar = useMemo(() => {
    const today = marks.filter((m) => m.tipo === 'entrada').map((m) => m.user_id);
    return personal.filter((p) => p.rol === 'personal' && !today.includes(p.id));
  }, [marks, personal]);

  // Detailed per-employee daily report against schedule.
  const dailyReport = useMemo(() => {
    const tol = cfg.tolerancia_minutos ?? 10;
    const [eh, em] = cfg.hora_entrada.split(':').map(Number);
    const [sh, sm] = cfg.hora_salida.split(':').map(Number);
    const targetEntrada = eh * 60 + em;
    const targetSalida = sh * 60 + sm;

    const byUser = {};
    for (const p of personal.filter((x) => x.rol === 'personal')) {
      byUser[p.id] = { id: p.id, nombre: p.nombre, foto_perfil: p.foto_perfil, entrada: null, salida: null };
    }
    for (const m of marks) {
      if (!byUser[m.user_id]) continue;
      if (m.tipo === 'entrada' && !byUser[m.user_id].entrada) byUser[m.user_id].entrada = m;
      if (m.tipo === 'salida') byUser[m.user_id].salida = m;
    }
    return Object.values(byUser).map((u) => {
      let entradaStatus = 'pendiente';
      let entradaDelta = null;
      if (u.entrada) {
        const [h, mi] = (u.entrada.hora || '00:00').split(':').map(Number);
        entradaDelta = (h * 60 + mi) - targetEntrada;
        if (entradaDelta <= 0) entradaStatus = 'temprano';
        else if (entradaDelta <= tol) entradaStatus = 'a_tiempo';
        else entradaStatus = 'tarde';
      }
      let salidaStatus = 'pendiente';
      let salidaDelta = null;
      if (u.salida) {
        const [h, mi] = (u.salida.hora || '00:00').split(':').map(Number);
        salidaDelta = (h * 60 + mi) - targetSalida;
        if (salidaDelta < 0) salidaStatus = 'temprano';
        else salidaStatus = 'a_tiempo';
      }
      return { ...u, entradaStatus, entradaDelta, salidaStatus, salidaDelta };
    }).sort((a, b) => {
      const order = { tarde: 0, pendiente: 1, a_tiempo: 2, temprano: 3 };
      return order[a.entradaStatus] - order[b.entradaStatus];
    });
  }, [marks, personal, cfg]);

  const reportSummary = useMemo(() => {
    const r = { aTiempo: 0, tarde: 0, sinMarcar: 0, completaron: 0 };
    for (const u of dailyReport) {
      if (u.entradaStatus === 'pendiente') r.sinMarcar++;
      else if (u.entradaStatus === 'tarde') r.tarde++;
      else r.aTiempo++;
      if (u.salida) r.completaron++;
    }
    return r;
  }, [dailyReport]);

  const mapCenter = marks.find((m) => m.latitud)
    ? [marks.find((m) => m.latitud).latitud, marks.find((m) => m.latitud).longitud]
    : [-25.3, -57.6]; // Asunción, Paraguay

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

  async function togglePending(it) {
    setPendings((prev) => prev.filter((x) => x.id !== it.id));
    await supabase.from('checklists').update({ completado: true }).eq('id', it.id);
  }
  async function renewForTomorrow(it) {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const tomorrow = t.toLocaleDateString('en-CA');
    const { error } = await supabase.from('checklists').insert({
      user_id: user.id, titulo: it.titulo, repetible: it.repetible, fecha: tomorrow,
    });
    if (error) toast.error(error.message);
    else toast.success(`Renovado para mañana: ${it.titulo}`);
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
            <div><p className="label-eyebrow mb-1">Ubicación</p><h2 className="text-lg font-black">Marcaciones de hoy</h2></div>
            <Badge className="bg-gold/15 text-gold border border-gold/30 uppercase tracking-wider">{marks.filter(m=>m.latitud).length} puntos</Badge>
          </div>
          <div className="h-[420px]">
            <MapContainer center={mapCenter} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; CARTO &copy; OpenStreetMap' />
              {marks.filter((m) => m.latitud).map((m) => (
                <Marker key={m.id} position={[m.latitud, m.longitud]} icon={goldIcon} eventHandlers={{ click: () => setSelected(m) }}>
                  <Popup>
                    <div className="space-y-1">
                      <p className="font-bold text-white">{m.profiles?.nombre}</p>
                      <p className="text-xs text-zinc-400">{m.tipo === 'entrada' ? 'Entrada' : 'Salida'} · {formatTime(m.hora)}</p>
                      <p className="text-[11px] text-zinc-500">{m.direccion_geolocalizada}</p>
                      <a href={mapsUrl(m.latitud, m.longitud)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 mt-2 text-[11px] text-gold font-bold uppercase tracking-wider">
                        <ExternalLink className="w-3 h-3" /> Abrir en Maps
                      </a>
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
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors" data-testid={`mark-item-${m.id}`}>
                <button onClick={() => setSelected(m)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${m.tipo === 'entrada' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'}`}>
                    {m.tipo === 'entrada' ? <InIcon className="w-4 h-4" /> : <OutIcon className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{m.profiles?.nombre}</p>
                    <p className="text-[11px] text-zinc-500 truncate">{formatTime(m.hora)} · {m.direccion_geolocalizada || 'Ubicación'}</p>
                  </div>
                </button>
                {(() => {
                  const delay = computeMarkDelay(m, cfg);
                  return delay > 0 ? (
                    <Badge className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 uppercase text-[10px]">+{minutesToText(delay)}</Badge>
                  ) : (
                    <Badge className="bg-green-500/15 text-green-400 border border-green-500/30 uppercase text-[10px]">A tiempo</Badge>
                  );
                })()}
                {m.latitud != null && (
                  <a
                    href={mapsUrl(m.latitud, m.longitud)}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 w-9 h-9 rounded-xl grid place-items-center bg-gold/10 text-gold hover:bg-gold/20 border border-gold/30 transition-colors"
                    title="Ver ubicación en Maps"
                    data-testid={`mark-view-location-${m.id}`}
                  >
                    <MapPin className="w-4 h-4" />
                  </a>
                )}
              </div>
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

        {/* TAREAS URGENTES */}
        <div className="card-premium p-5 fade-up lg:col-span-2" data-testid="urgent-tasks">
          <div className="flex items-center justify-between mb-4">
            <div><p className="label-eyebrow">Prioridad</p><h2 className="text-lg font-black">Tareas urgentes</h2></div>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="space-y-2 max-h-[280px] overflow-auto">
            {tasks.filter(t => t.estado !== 'completada').slice(0, 10).map((t) => (
              <div key={t.id} className="p-3 rounded-xl hover:bg-white/5 flex items-center gap-3">
                <UrgencyDot u={t.urgencia} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{t.titulo}</p>
                  <p className="text-[11px] text-zinc-500 truncate">→ {t.assignee?.nombre || '—'} · {t.estado}</p>
                </div>
              </div>
            ))}
            {tasks.length === 0 && <p className="text-zinc-500 text-sm py-4 text-center">Sin tareas activas.</p>}
          </div>
        </div>
      </div>

      {/* REPORTE DEL DÍA · horarios — full width with detailed cards */}
      <div className="card-premium p-6 fade-up" data-testid="daily-schedule-report">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <p className="label-eyebrow">Desempeño del día</p>
            <h2 className="text-2xl font-black tracking-tight">Reporte de horarios</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Jornada configurada · Entrada <span className="text-white font-bold">{cfg.hora_entrada}</span> · Salida <span className="text-white font-bold">{cfg.hora_salida}</span> · Tolerancia <span className="text-white font-bold">{cfg.tolerancia_minutos} min</span>
            </p>
          </div>
          <Clock className="w-5 h-5 text-yellow-400" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <SummaryStat label="A tiempo" value={reportSummary.aTiempo} color="green" />
          <SummaryStat label="Tarde" value={reportSummary.tarde} color="yellow" />
          <SummaryStat label="Sin marcar" value={reportSummary.sinMarcar} color="red" />
          <SummaryStat label="Salieron" value={reportSummary.completaron} color="blue" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {dailyReport.length === 0 && <p className="text-zinc-500 text-sm py-4 text-center col-span-full">Sin personal activo.</p>}
          {dailyReport.map((u) => <ScheduleCard key={u.id} u={u} cfg={cfg} />)}
        </div>
      </div>

      {/* ADMIN PENDIENTES quick access */}
      <div className="card-premium p-5 fade-up" data-testid="admin-pendings-quick">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="label-eyebrow">Acceso rápido</p>
            <h2 className="text-lg font-black">Mis pendientes</h2>
          </div>
          <Link to="/admin/pendientes" className="text-xs text-gold font-bold uppercase tracking-wider flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Gestionar
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {pendings.slice(0, 6).map((it) => (
            <div key={it.id} className="rounded-xl bg-white/5 hover:bg-white/10 p-3 flex items-center gap-3" data-testid={`admin-home-pending-${it.id}`}>
              <button
                onClick={() => togglePending(it)}
                aria-label="Completar"
                className="shrink-0 w-6 h-6 rounded-md border border-white/30 hover:border-gold transition-all"
                data-testid={`admin-home-pending-toggle-${it.id}`}
              />
              <p className="flex-1 text-sm text-white truncate">{it.titulo}</p>
              {it.repetible && <Repeat className="w-3.5 h-3.5 text-gold shrink-0" />}
              <button
                onClick={() => renewForTomorrow(it)}
                className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-gold/15 text-gold hover:bg-gold/25 border border-gold/30"
                data-testid={`admin-home-pending-renew-${it.id}`}
                title="Renovar para mañana"
              >
                Mañana
              </button>
            </div>
          ))}
          {pendings.length === 0 && (
            <Link to="/admin/pendientes" className="col-span-full rounded-xl bg-white/5 hover:bg-white/10 p-4 text-center text-zinc-500 block">
              <CheckSquare className="w-6 h-6 mx-auto mb-1 opacity-50" />
              <p className="text-sm">Sin pendientes hoy. Toca para crear uno.</p>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, color }) {
  const map = {
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  };
  return (
    <div className={`rounded-xl border p-4 text-center ${map[color]}`}>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wider">{label}</p>
      <p className="text-3xl md:text-4xl font-black">{value}</p>
    </div>
  );
}

function ScheduleCard({ u, cfg }) {
  const eMap = {
    a_tiempo: { c: 'bg-green-500/15 text-green-300 border-green-500/30', t: 'A tiempo' },
    tarde: { c: 'bg-red-500/15 text-red-300 border-red-500/30', t: 'Tarde' },
    temprano: { c: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', t: 'Temprano' },
    pendiente: { c: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30', t: 'No marcó' },
  };
  const sMap = {
    a_tiempo: { c: 'bg-blue-500/15 text-blue-300 border-blue-500/30', t: 'A tiempo' },
    temprano: { c: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30', t: 'Antes de hora' },
    pendiente: { c: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20', t: 'No salió' },
  };
  const e = eMap[u.entradaStatus];
  const s = sMap[u.salidaStatus];
  const accent =
    u.entradaStatus === 'tarde' ? 'border-red-500/30' :
    u.entradaStatus === 'pendiente' ? 'border-zinc-500/20' :
    'border-green-500/20';
  return (
    <div className={`rounded-xl border ${accent} bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors`} data-testid={`schedule-row-${u.id}`}>
      <div className="flex items-center gap-3 mb-3">
        <Avatar src={u.foto_perfil} name={u.nombre} size={40} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-white truncate">{u.nombre}</p>
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Personal</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-black/30 p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Entrada</p>
            <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase ${e.c}`}>{e.t}</span>
          </div>
          <p className="text-lg font-black text-white mt-1">{u.entrada ? u.entrada.hora?.slice(0, 5) : '—:—'}</p>
          <p className="text-[10px] text-zinc-500">Esperada {cfg.hora_entrada}</p>
          {u.entradaStatus === 'tarde' && <p className="text-[10px] text-red-400 font-bold mt-0.5">+{u.entradaDelta} min tarde</p>}
          {u.entradaStatus === 'temprano' && u.entradaDelta !== null && <p className="text-[10px] text-emerald-400 font-bold mt-0.5">{u.entradaDelta < 0 ? `${-u.entradaDelta} min antes` : 'En punto'}</p>}
        </div>
        <div className="rounded-lg bg-black/30 p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Salida</p>
            <span className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase ${s.c}`}>{s.t}</span>
          </div>
          <p className="text-lg font-black text-white mt-1">{u.salida ? u.salida.hora?.slice(0, 5) : '—:—'}</p>
          <p className="text-[10px] text-zinc-500">Esperada {cfg.hora_salida}</p>
          {u.salidaStatus === 'temprano' && u.salidaDelta !== null && <p className="text-[10px] text-yellow-400 font-bold mt-0.5">{-u.salidaDelta} min antes</p>}
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
