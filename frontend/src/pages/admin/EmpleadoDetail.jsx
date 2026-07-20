import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { applyRealtimeChange } from '../../lib/realtime';
import { ArrowLeft, ChevronRight, ClipboardList, MessageSquare, Loader2 } from 'lucide-react';
import { Avatar } from './Dashboard';
import { Badge } from '../../components/ui/badge';

export default function EmpleadoDetail() {
  const { id } = useParams();
  const [employee, setEmployee] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [{ data: p }, { data: t }] = await Promise.all([
      supabase.from('profiles').select('id,nombre,email,telefono,foto_perfil,activo').eq('id', id).maybeSingle(),
      supabase.from('tasks').select('id,titulo,descripcion,estado,urgencia,assignee_id,fecha_limite,created_at').eq('assignee_id', id).order('created_at', { ascending: false }),
    ]);
    setEmployee(p || null);
    setTasks(t || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useRealtime(`empleado_${id}`, (ch) => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assignee_id=eq.${id}` },
      (p) => applyRealtimeChange(setTasks, p));
  }, [id]);

  const grupos = useMemo(() => ({
    en_progreso: tasks.filter((t) => t.estado === 'en_progreso'),
    pendiente: tasks.filter((t) => t.estado === 'pendiente'),
    completada: tasks.filter((t) => t.estado === 'completada'),
  }), [tasks]);

  if (loading) return <p className="text-zinc-500">Cargando…</p>;
  if (!employee) return <p className="text-zinc-500">Empleado no encontrado.</p>;

  return (
    <div className="space-y-6" data-testid="admin-empleado-detail">
      <Link to="/admin/personal" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white">
        <ArrowLeft className="w-3.5 h-3.5" /> Volver a personal
      </Link>

      <header className="card-premium p-5 flex items-center gap-4">
        <Avatar src={employee.foto_perfil} name={employee.nombre} size={64} />
        <div className="flex-1 min-w-0">
          <p className="label-eyebrow">Empleado</p>
          <h1 className="text-2xl font-black tracking-tight truncate">{employee.nombre}</h1>
          <p className="text-xs text-zinc-500 truncate">{employee.email} · {employee.telefono || '—'}</p>
        </div>
        <Badge className={employee.activo ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-zinc-700/40 text-zinc-400'}>
          {employee.activo ? 'Activo' : 'Inactivo'}
        </Badge>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <Stat label="En progreso" value={grupos.en_progreso.length} color="yellow" />
        <Stat label="Pendientes" value={grupos.pendiente.length} color="red" />
        <Stat label="Completadas" value={grupos.completada.length} color="green" />
      </section>

      <Group title="En progreso" color="text-yellow-400" items={grupos.en_progreso} />
      <Group title="Pendientes" color="text-red-400" items={grupos.pendiente} />
      <Group title="Completadas" color="text-zinc-500" items={grupos.completada} muted />

      {tasks.length === 0 && (
        <div className="card-premium p-10 text-center text-zinc-500">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Este empleado todavía no tiene tareas.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  const map = {
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    yellow: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
    red: 'bg-red-500/10 border-red-500/30 text-red-400',
  };
  return (
    <div className={`rounded-xl border p-4 text-center ${map[color]}`}>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-black">{value}</p>
    </div>
  );
}

function Group({ title, color, items, muted }) {
  if (!items.length) return null;
  return (
    <section>
      <p className={`label-eyebrow mb-2 ${color}`}>{title} · {items.length}</p>
      <div className="space-y-2">
        {items.map((t) => (
          <Link key={t.id} to={`/admin/tareas/${t.id}`} className={`card-premium p-4 flex items-center gap-3 fade-up ${muted ? 'opacity-60' : ''}`} data-testid={`empleado-task-row-${t.id}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${t.urgencia === 'rojo' ? 'bg-red-500' : t.urgencia === 'amarillo' ? 'bg-yellow-400' : 'bg-green-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{t.titulo}</p>
              <p className="text-xs text-zinc-500 truncate">{t.descripcion || '—'}</p>
            </div>
            <MessageSquare className="w-4 h-4 text-zinc-500" />
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </Link>
        ))}
      </div>
    </section>
  );
}
