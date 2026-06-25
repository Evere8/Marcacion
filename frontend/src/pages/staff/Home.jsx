import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { MapPin, ClipboardList, LogIn as InIcon, LogOut as OutIcon, AlertTriangle, ChevronRight, CheckSquare, Plus, Repeat, Play, Square, Truck } from 'lucide-react';
import { formatTime, todayISO, computeMarkDelay } from '../../lib/format';
import { mapsUrl } from '../../lib/gps';
import { requestNotificationPermission } from '../../hooks/useNotifications';
import { useClockInReminder } from '../../hooks/useClockInReminder';
import { PushToggle } from '../../components/PushPrompt';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export default function StaffHome() {
  const { user, profile } = useAuth();
  const nav = useNavigate();
  const [todayMarks, setTodayMarks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pendings, setPendings] = useState([]);
  const [trabajos, setTrabajos] = useState([]);
  const [cfg, setCfg] = useState({ hora_entrada: '08:00', hora_salida: '17:00' });
  const [cargos, setCargos] = useState([]);
  const [now, setNow] = useState(new Date());

  // El cronómetro se muestra si el cargo del usuario tiene `con_cronometro=true`.
  // Si todavía no se aplicó la SQL de cargos o el usuario no tiene cargo, se
  // asume "chofer" por compatibilidad.
  const userCargo = (profile?.cargo || '').toLowerCase();
  const cargoRec = cargos.find((c) => c.nombre?.toLowerCase() === userCargo);
  const tieneCronometro = cargoRec
    ? !!cargoRec.con_cronometro
    : (userCargo === 'chofer' || !userCargo);
  const userEntrada = profile?.hora_entrada?.slice?.(0, 5) || cfg.hora_entrada;
  const userSalida = profile?.hora_salida?.slice?.(0, 5) || cfg.hora_salida;

  async function load() {
    const today = todayISO();
    const [m, t, c, ch, tr, cg] = await Promise.all([
      supabase.from('marks').select('*').eq('user_id', user.id).eq('fecha', today).order('created_at'),
      supabase.from('tasks').select('*').eq('assignee_id', user.id).neq('estado', 'completada').order('urgencia', { ascending: false }),
      supabase.from('attendance_config').select('*').limit(1).maybeSingle(),
      supabase.from('checklists').select('*').eq('user_id', user.id).eq('fecha', today).eq('completado', false).order('created_at'),
      supabase.from('trabajos').select('*').eq('user_id', user.id).eq('fecha', today).order('created_at', { ascending: false }),
      supabase.from('cargos').select('*').order('orden'),
    ]);
    setTodayMarks(m.data || []);
    setTasks(t.data || []);
    setPendings(ch.data || []);
    setTrabajos(tr.data || []);
    setCargos(cg.data || []);
    if (c.data) setCfg({ hora_entrada: c.data.hora_entrada?.slice(0, 5), hora_salida: c.data.hora_salida?.slice(0, 5) });
  }

  useEffect(() => {
    load();
    requestNotificationPermission();
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
    // eslint-disable-next-line
  }, [user]);

  useRealtime(user ? `staff_home_${user.id}` : 'staff_home', (ch) => {
    if (!user) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'marks', filter: `user_id=eq.${user.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assignee_id=eq.${user.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklists', filter: `user_id=eq.${user.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trabajos', filter: `user_id=eq.${user.id}` }, load);
  }, [user?.id]);

  const hasEntrada = todayMarks.some((m) => m.tipo === 'entrada');
  const hasSalida = todayMarks.some((m) => m.tipo === 'salida');
  const nextAction = !hasEntrada ? 'entrada' : !hasSalida ? 'salida' : null;

  // Cronómetro de tiempo trabajado (entrada → salida o ahora)
  const entradaMark = todayMarks.find((m) => m.tipo === 'entrada');
  const salidaMark = todayMarks.find((m) => m.tipo === 'salida');
  const workedMs = (() => {
    if (!entradaMark) return 0;
    const start = new Date(entradaMark.created_at).getTime();
    const end = salidaMark ? new Date(salidaMark.created_at).getTime() : now.getTime();
    return Math.max(0, end - start);
  })();
  const workedFmt = (() => {
    const totalSec = Math.floor(workedMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  })();

  useClockInReminder({ userId: user?.id, hasEntrada, hasSalida });

  // ------- TRABAJOS / CRONÓMETRO (solo chofer) -------
  const trabajoActivo = trabajos.find((t) => t.iniciado_en && !t.finalizado_en);
  const trabajosPendientes = trabajos.filter((t) => !t.iniciado_en);
  const trabajosFinalizados = trabajos.filter((t) => t.finalizado_en);
  const elapsedSec = trabajoActivo
    ? Math.max(0, Math.floor((now.getTime() - new Date(trabajoActivo.iniciado_en).getTime()) / 1000))
    : 0;
  const fmtElapsed = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  async function iniciarTarea(t) {
    if (trabajoActivo) { toast.error('Ya tienes una tarea en curso. Finalízala primero.'); return; }
    const { error } = await supabase.from('trabajos').update({ iniciado_en: new Date().toISOString() }).eq('id', t.id);
    if (error) toast.error(error.message); else toast.success(`Tarea iniciada: ${t.detalle.slice(0, 30)}`);
  }
  async function finalizarTarea(t) {
    const { error } = await supabase.from('trabajos').update({ finalizado_en: new Date().toISOString() }).eq('id', t.id);
    if (error) toast.error(error.message); else toast.success('Tarea finalizada');
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
    <div className="space-y-6" data-testid="staff-home">
      <div className="flex justify-end">
        <PushToggle />
      </div>
      {/* CLOCK CARD */}
      <div className="card-premium p-6 text-center fade-up">
        <p className="label-eyebrow">Hora actual · Paraguay</p>
        <p className="text-6xl font-black tracking-tighter mt-2 gold-gradient-text" data-testid="current-time">{now.toLocaleTimeString('es-ES', { timeZone: 'America/Asuncion', hour: '2-digit', minute: '2-digit' })}</p>
        <p className="text-xs text-zinc-500 mt-1">Tu jornada: {userEntrada} · {userSalida}</p>

        <div className="mt-6">
          {nextAction ? (
            <button onClick={() => nav('/app/marcar', { state: { tipo: nextAction } })}
              data-testid="staff-mark-button"
              className={`relative mx-auto w-44 h-44 rounded-full font-black text-xl text-obsidian flex flex-col items-center justify-center pulse-gold transition-transform active:scale-95 ${nextAction === 'entrada' ? 'bg-gradient-to-br from-[#E5C865] to-[#8A7120]' : 'bg-gradient-to-br from-silver to-zinc-400'}`}>
              {nextAction === 'entrada' ? <InIcon className="w-8 h-8 mb-1" /> : <OutIcon className="w-8 h-8 mb-1" />}
              Marcar<br /><span className="uppercase tracking-widest text-xs">{nextAction}</span>
            </button>
          ) : (
            <div className="mx-auto w-44 h-44 rounded-full bg-green-500/15 border border-green-500/30 text-green-400 grid place-items-center">
              <div className="text-center">
                <p className="text-sm font-bold">Jornada</p>
                <p className="text-2xl font-black">Completa</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <StatusChip tipo="entrada" mark={todayMarks.find((m) => m.tipo === 'entrada')} cfg={cfg} profile={profile} />
          <StatusChip tipo="salida" mark={todayMarks.find((m) => m.tipo === 'salida')} cfg={cfg} profile={profile} />
        </div>

        {entradaMark && (
          <div className="mt-4 rounded-xl border border-gold/30 bg-gradient-to-r from-gold/5 via-gold/10 to-gold/5 p-4 fade-up" data-testid="worked-timer">
            <div className="flex items-center justify-between mb-1">
              <p className="label-eyebrow text-gold">{salidaMark ? 'Tiempo trabajado' : 'Cronómetro activo'}</p>
              {!salidaMark && <span className="flex items-center gap-1.5 text-[10px] text-green-400 font-bold uppercase tracking-wider"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> En curso</span>}
              {salidaMark && <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Jornada cerrada</span>}
            </div>
            <p className="text-4xl md:text-5xl font-black tracking-tighter gold-gradient-text font-mono">{workedFmt}</p>
            <p className="text-[11px] text-zinc-500 mt-1">
              Desde {entradaMark.hora?.slice(0, 5)}{salidaMark ? ` hasta ${salidaMark.hora?.slice(0, 5)}` : ''}
            </p>
          </div>
        )}
      </div>

      {/* TRABAJOS / CRONÓMETRO (solo cargos con con_cronometro=true) */}
      {tieneCronometro && (
        <section data-testid="staff-home-trabajos">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="label-eyebrow">Trabajos</p>
              <h2 className="text-xl font-black">
                {trabajoActivo ? 'Tarea en curso' : trabajosPendientes.length ? 'Listas para iniciar' : 'Sin trabajos hoy'}
              </h2>
            </div>
            <Link to="/app/tareas" className="text-xs text-gold font-bold uppercase tracking-wider flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" /> Cargar tarea
            </Link>
          </div>

          {trabajoActivo && (
            <div className="card-premium p-4 mb-3 border border-green-500/30 bg-gradient-to-br from-green-500/5 to-emerald-500/10 fade-up" data-testid={`trabajo-activo-${trabajoActivo.id}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-green-400">En curso</p>
                <span className="ml-auto text-[10px] text-zinc-500">Cantidad: <span className="text-white font-bold">{trabajoActivo.cantidad}</span></span>
              </div>
              <p className="text-sm font-bold text-white whitespace-pre-wrap break-words mb-3">{trabajoActivo.detalle}</p>
              <div className="rounded-xl bg-black/30 border border-green-500/20 p-3 text-center mb-3">
                <p className="text-[10px] uppercase tracking-wider text-zinc-500">Tiempo del viaje</p>
                <p className="text-4xl font-black font-mono text-green-300">{fmtElapsed(elapsedSec)}</p>
              </div>
              <button
                onClick={() => finalizarTarea(trabajoActivo)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-br from-red-500 to-red-700 text-white font-black uppercase tracking-wider active:scale-95 transition-transform"
                data-testid={`trabajo-finalizar-${trabajoActivo.id}`}
              >
                <Square className="w-4 h-4 fill-current" /> Finalizar tarea
              </button>
            </div>
          )}

          {!trabajoActivo && trabajosPendientes.length > 0 && (
            <div className="space-y-2">
              {trabajosPendientes.map((t) => (
                <div key={t.id} className="card-premium p-3 flex items-center gap-3 fade-up" data-testid={`trabajo-pendiente-${t.id}`}>
                  <div className="rounded-xl bg-gold/15 border border-gold/30 text-gold w-12 h-12 grid place-items-center shrink-0">
                    <Truck className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{t.detalle}</p>
                    <p className="text-[11px] text-zinc-500">Cantidad: {t.cantidad} · {t.hora?.slice(0, 5)}</p>
                  </div>
                  <button
                    onClick={() => iniciarTarea(t)}
                    className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-700 text-white font-black text-xs uppercase tracking-wider active:scale-95 transition-transform"
                    data-testid={`trabajo-iniciar-${t.id}`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" /> Iniciar
                  </button>
                </div>
              ))}
            </div>
          )}

          {trabajosFinalizados.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500">Finalizadas hoy · {trabajosFinalizados.length}</p>
              {trabajosFinalizados.slice(0, 3).map((t) => {
                const dur = t.duracion_segundos || 0;
                const h = Math.floor(dur / 3600), m = Math.floor((dur % 3600) / 60);
                return (
                  <div key={t.id} className="rounded-xl bg-white/5 p-2.5 flex items-center gap-3 text-xs" data-testid={`trabajo-finalizado-${t.id}`}>
                    <CheckSquare className="w-4 h-4 text-green-400 shrink-0" />
                    <p className="flex-1 min-w-0 truncate text-zinc-300">{t.detalle}</p>
                    <span className="font-mono text-blue-300 font-bold">{h}h {m}m</span>
                  </div>
                );
              })}
            </div>
          )}

          {!trabajoActivo && trabajosPendientes.length === 0 && trabajosFinalizados.length === 0 && (
            <Link to="/app/tareas" className="card-premium p-6 text-center text-zinc-500 block hover:bg-white/5">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Carga una tarea para comenzar el viaje.</p>
            </Link>
          )}
        </section>
      )}

      {/* PENDIENTES rápidos */}
      <section data-testid="staff-home-pendings">
        <div className="flex items-center justify-between mb-3">
          <div><p className="label-eyebrow">Acceso rápido</p><h2 className="text-xl font-black">Pendientes de hoy</h2></div>
          <Link to="/app/pendientes" className="text-xs text-gold font-bold uppercase tracking-wider flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Gestionar
          </Link>
        </div>
        <div className="space-y-2">
          {pendings.slice(0, 5).map((it) => (
            <div key={it.id} className="card-premium p-3 flex items-center gap-3 fade-up" data-testid={`home-pending-${it.id}`}>
              <button
                onClick={() => togglePending(it)}
                aria-label="Completar"
                className="shrink-0 w-7 h-7 rounded-md border border-white/30 hover:border-gold transition-all"
                data-testid={`home-pending-toggle-${it.id}`}
              />
              <p className="flex-1 text-sm text-white truncate">{it.titulo}</p>
              {it.repetible && <Repeat className="w-3.5 h-3.5 text-gold shrink-0" title="Diario" />}
              <button
                onClick={() => renewForTomorrow(it)}
                className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-gold/15 text-gold hover:bg-gold/25 border border-gold/30"
                data-testid={`home-pending-renew-${it.id}`}
                title="Renovar para mañana"
              >
                Mañana
              </button>
            </div>
          ))}
          {pendings.length === 0 && (
            <Link to="/app/pendientes" className="card-premium p-6 text-center text-zinc-500 block hover:bg-white/5">
              <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Sin pendientes hoy. Toca para crear uno.</p>
            </Link>
          )}
        </div>
      </section>

      {/* TASKS */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div><p className="label-eyebrow">Asignadas</p><h2 className="text-xl font-black">Tus tareas</h2></div>
          <Link to="/app/tareas" className="text-xs text-gold font-bold uppercase tracking-wider">Ver todas</Link>
        </div>
        <div className="space-y-2">
          {tasks.slice(0, 5).map((t) => (
            <Link key={t.id} to={`/app/tareas/${t.id}`} className="card-premium p-4 flex items-center gap-3 fade-up" data-testid={`staff-task-${t.id}`}>
              <span className={`w-2.5 h-2.5 rounded-full ${t.urgencia === 'rojo' ? 'bg-red-500' : t.urgencia === 'amarillo' ? 'bg-yellow-400' : 'bg-green-500'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate">{t.titulo}</p>
                <p className="text-xs text-zinc-500 truncate">{t.descripcion || '—'}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </Link>
          ))}
          {tasks.length === 0 && (
            <div className="card-premium p-8 text-center text-zinc-500">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Sin tareas pendientes.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusChip({ tipo, mark, cfg, profile }) {
  const marked = !!mark;
  const fake = mark?.fake_gps_detected;
  // Build an effective cfg that overlays per-employee hours.
  const effCfg = {
    hora_entrada: profile?.hora_entrada?.slice?.(0, 5) || cfg.hora_entrada,
    hora_salida: profile?.hora_salida?.slice?.(0, 5) || cfg.hora_salida,
    tolerancia_minutos: cfg.tolerancia_minutos ?? 0,
  };
  const delay = marked ? computeMarkDelay({ ...mark, profiles: profile }, effCfg) : 0;
  const bg = marked ? (tipo === 'entrada' ? 'bg-green-500/10 border-green-500/30' : 'bg-blue-500/10 border-blue-500/30') : 'bg-white/5 border-white/10';
  const tx = marked ? (tipo === 'entrada' ? 'text-green-400' : 'text-blue-400') : 'text-zinc-500';
  return (
    <div className={`rounded-xl border px-3 py-3 relative ${bg}`} data-testid={`status-${tipo}`}>
      <p className="label-eyebrow">{tipo === 'entrada' ? 'Entrada' : 'Salida'}</p>
      <p className={`text-lg font-black ${tx}`}>{marked ? formatTime(mark.hora) : '—:—'}</p>
      {fake && <p className="text-[10px] text-red-400 font-bold flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> GPS sospechoso</p>}
      {marked && delay > 0 && !fake && <p className="text-[10px] text-yellow-400 font-bold mt-1">+{delay} min tarde</p>}
      {marked && delay === 0 && !fake && <p className="text-[10px] text-green-400 font-bold mt-1">A tiempo</p>}
      {marked && mark.latitud != null && (
        <a
          href={mapsUrl(mark.latitud, mark.longitud)}
          target="_blank"
          rel="noreferrer"
          className="absolute top-2 right-2 w-7 h-7 rounded-lg grid place-items-center bg-gold/15 text-gold hover:bg-gold/25 border border-gold/30"
          title="Ver ubicación"
          data-testid={`status-${tipo}-view-location`}
        >
          <MapPin className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}
