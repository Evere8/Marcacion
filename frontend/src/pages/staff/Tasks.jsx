import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { ClipboardList, ChevronRight, Plus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';

const empty = { titulo: '', descripcion: '', urgencia: 'verde', fecha_limite: '' };

export default function StaffTasks() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from('tasks').select('*').eq('assignee_id', user.id).order('created_at', { ascending: false });
    setRows(data || []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useRealtime(user ? `staff_tasks_${user.id}` : 'staff_tasks', (ch) => {
    if (!user) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assignee_id=eq.${user.id}` }, load);
  }, [user?.id]);

  async function save() {
    if (!form.titulo) { toast.error('Título requerido'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('tasks').insert({
        titulo: form.titulo,
        descripcion: form.descripcion,
        urgencia: form.urgencia,
        assignee_id: user.id,
        admin_id: null,
        fecha_limite: form.fecha_limite || null,
      });
      if (error) throw error;
      toast.success('Tarea creada. Los administradores fueron notificados.');
      setOpen(false); setForm(empty); load();
    } catch (e) { toast.error(e.message || 'Error'); } finally { setSaving(false); }
  }

  const rojas = rows.filter((r) => r.urgencia === 'rojo' && r.estado !== 'completada');
  const amarillas = rows.filter((r) => r.urgencia === 'amarillo' && r.estado !== 'completada');
  const verdes = rows.filter((r) => r.urgencia === 'verde' && r.estado !== 'completada');
  const completadas = rows.filter((r) => r.estado === 'completada');

  return (
    <div className="space-y-5" data-testid="staff-tasks-page">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="label-eyebrow">Mis tareas</p>
          <h1 className="text-2xl font-black tracking-tight">Tareas</h1>
        </div>
        <button onClick={() => { setForm(empty); setOpen(true); }} className="btn-gold flex items-center gap-2" data-testid="staff-tasks-new-button">
          <Plus className="w-4 h-4" /> Nueva
        </button>
      </header>

      <Group title="Urgentes" color="text-red-400" items={rojas} />
      <Group title="Medias" color="text-yellow-400" items={amarillas} />
      <Group title="A tiempo" color="text-green-400" items={verdes} />
      <Group title="Completadas" color="text-zinc-500" items={completadas} muted />
      {rows.length === 0 && (
        <div className="card-premium p-10 text-center text-zinc-500"><ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>Sin tareas. Crea la primera.</p></div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-surface border-white/10" data-testid="staff-task-create-dialog">
          <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="label-eyebrow mb-2 block">Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="staff-task-titulo" />
            </div>
            <div>
              <Label className="label-eyebrow mb-2 block">Descripción</Label>
              <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={4} className="bg-panel border-white/10 rounded-xl" data-testid="staff-task-desc" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="label-eyebrow mb-2 block">Prioridad</Label>
                <Select value={form.urgencia} onValueChange={(v) => setForm({ ...form, urgencia: v })}>
                  <SelectTrigger className="bg-panel border-white/10 h-11 rounded-xl" data-testid="staff-task-urgencia"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-surface border-white/10">
                    <SelectItem value="verde">🟢 A tiempo</SelectItem>
                    <SelectItem value="amarillo">🟡 Media</SelectItem>
                    <SelectItem value="rojo">🔴 Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="label-eyebrow mb-2 block">Fecha límite</Label>
                <Input type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="staff-task-fecha" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="btn-ghost">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-gold flex items-center gap-2" data-testid="staff-task-save">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Crear
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              <p className="text-xs text-zinc-500 truncate">{t.descripcion || '—'} · {t.estado.replace('_', ' ')}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-600" />
          </Link>
        ))}
      </div>
    </section>
  );
}
