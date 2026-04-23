import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { MapPin, ClipboardList, LogIn as InIcon, LogOut as OutIcon, AlertTriangle, ChevronRight } from 'lucide-react';
import { formatTime, todayISO } from '../../lib/format';
import { requestNotificationPermission } from '../../hooks/useNotifications';
import { useNavigate } from 'react-router-dom';

export default function StaffHome() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [todayMarks, setTodayMarks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [cfg, setCfg] = useState({ hora_entrada: '08:00', hora_salida: '17:00' });
  const [now, setNow] = useState(new Date());

  async function load() {
    const [m, t, c] = await Promise.all([
      supabase.from('marks').select('*').eq('user_id', user.id).eq('fecha', todayISO()).order('created_at'),
      supabase.from('tasks').select('*').eq('assignee_id', user.id).neq('estado', 'completada').order('urgencia', { ascending: false }),
      supabase.from('attendance_config').select('*').limit(1).maybeSingle(),
    ]);
    setTodayMarks(m.data || []);
    setTasks(t.data || []);
    if (c.data) setCfg({ hora_entrada: c.data.hora_entrada?.slice(0, 5), hora_salida: c.data.hora_salida?.slice(0, 5) });
  }

  useEffect(() => {
    load();
    requestNotificationPermission();
    const i = setInterval(() => setNow(new Date()), 30000);
    const ch = supabase.channel('staff_home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'marks', filter: `user_id=eq.${user.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assignee_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { clearInterval(i); supabase.removeChannel(ch); };
  }, [user]);

  const hasEntrada = todayMarks.some((m) => m.tipo === 'entrada');
  const hasSalida = todayMarks.some((m) => m.tipo === 'salida');
  const nextAction = !hasEntrada ? 'entrada' : !hasSalida ? 'salida' : null;

  return (
    <div className="space-y-6" data-testid="staff-home">
      {/* CLOCK CARD */}
      <div className="card-premium p-6 text-center fade-up">
        <p className="label-eyebrow">Hora actual</p>
        <p className="text-6xl font-black tracking-tighter mt-2 gold-gradient-text" data-testid="current-time">{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
        <p className="text-xs text-zinc-500 mt-1">Entrada {cfg.hora_entrada} · Salida {cfg.hora_salida}</p>

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
          <StatusChip tipo="entrada" mark={todayMarks.find((m) => m.tipo === 'entrada')} />
          <StatusChip tipo="salida" mark={todayMarks.find((m) => m.tipo === 'salida')} />
        </div>
      </div>

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

function StatusChip({ tipo, mark }) {
  const marked = !!mark;
  const fake = mark?.fake_gps_detected;
  const bg = marked ? (tipo === 'entrada' ? 'bg-green-500/10 border-green-500/30' : 'bg-blue-500/10 border-blue-500/30') : 'bg-white/5 border-white/10';
  const tx = marked ? (tipo === 'entrada' ? 'text-green-400' : 'text-blue-400') : 'text-zinc-500';
  return (
    <div className={`rounded-xl border px-3 py-3 ${bg}`} data-testid={`status-${tipo}`}>
      <p className="label-eyebrow">{tipo === 'entrada' ? 'Entrada' : 'Salida'}</p>
      <p className={`text-lg font-black ${tx}`}>{marked ? formatTime(mark.hora) : '—:—'}</p>
      {fake && <p className="text-[10px] text-red-400 font-bold flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" /> GPS sospechoso</p>}
      {marked && mark.retraso_minutos > 0 && !fake && <p className="text-[10px] text-yellow-400 font-bold mt-1">+{mark.retraso_minutos} min</p>}
    </div>
  );
}
