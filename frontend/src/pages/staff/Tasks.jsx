import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ClipboardList, ChevronRight } from 'lucide-react';

export default function StaffTasks() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);

  async function load() {
    const { data } = await supabase.from('tasks').select('*').eq('assignee_id', user.id).order('created_at', { ascending: false });
    setRows(data || []);
  }
  useEffect(() => { load();
    const ch = supabase.channel('staff_tasks_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assignee_id=eq.${user.id}` }, load).subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const rojas = rows.filter((r) => r.urgencia === 'rojo' && r.estado !== 'completada');
  const amarillas = rows.filter((r) => r.urgencia === 'amarillo' && r.estado !== 'completada');
  const verdes = rows.filter((r) => r.urgencia === 'verde' && r.estado !== 'completada');
  const completadas = rows.filter((r) => r.estado === 'completada');

  return (
    <div className="space-y-5" data-testid="staff-tasks-page">
      <Group title="Urgentes" color="text-red-400" items={rojas} />
      <Group title="Medias" color="text-yellow-400" items={amarillas} />
      <Group title="A tiempo" color="text-green-400" items={verdes} />
      <Group title="Completadas" color="text-zinc-500" items={completadas} muted />
      {rows.length === 0 && (
        <div className="card-premium p-10 text-center text-zinc-500"><ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>Sin tareas asignadas.</p></div>
      )}
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
          <Link key={t.id} to={`/app/tareas/${t.id}`} className={`card-premium p-4 flex items-center gap-3 fade-up ${muted ? 'opacity-60' : ''}`} data-testid={`staff-task-row-${t.id}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${t.urgencia === 'rojo' ? 'bg-red-500' : t.urgencia === 'amarillo' ? 'bg-yellow-400' : 'bg-green-500'}`} />
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{t.titulo}</p>
              <p className="text-xs text-zinc-500 truncate">{t.descripcion || '—'}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </Link>
        ))}
      </div>
    </section>
  );
}
