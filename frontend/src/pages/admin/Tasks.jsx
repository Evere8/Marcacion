import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Plus, Loader2, ChevronRight, ClipboardList } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { toast } from 'sonner';
import { sendNotification } from '../../hooks/useNotifications';

const empty = { titulo: '', descripcion: '', urgencia: 'verde', assignee_id: '', fecha_limite: '' };

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('todas');

  async function load() {
    const { data: t } = await supabase.from('tasks').select('*, assignee:assignee_id(nombre,foto_perfil)').order('created_at', { ascending: false });
    setTasks(t || []);
    const { data: p } = await supabase.from('profiles').select('id,nombre,foto_perfil').eq('rol', 'personal').eq('activo', true);
    setPersonal(p || []);
  }
  useEffect(() => { load(); }, []);
  useRealtime('admin_tasks', (ch) => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, load);
  }, []);

  async function save() {
    if (!form.titulo || !form.assignee_id) { toast.error('Título y asignado requeridos'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('tasks').insert({
        titulo: form.titulo, descripcion: form.descripcion, urgencia: form.urgencia,
        assignee_id: form.assignee_id, admin_id: user.id,
        fecha_limite: form.fecha_limite || null,
      }).select().single();
      if (error) throw error;
      await sendNotification(form.assignee_id, {
        tipo: 'tarea', titulo: 'Nueva tarea asignada',
        mensaje: `${form.titulo} (${form.urgencia})`,
        link: `/app/tareas/${data.id}`,
      });
      toast.success('Tarea creada y notificada');
      setOpen(false); setForm(empty); load();
    } catch (e) { toast.error(e.message || 'Error'); } finally { setSaving(false); }
  }

  async function setUrgencia(id, urgencia, assignee_id, titulo) {
    await supabase.from('tasks').update({ urgencia }).eq('id', id);
    await sendNotification(assignee_id, {
      tipo: 'tarea', titulo: 'Cambio de urgencia',
      mensaje: `${titulo} → ${urgencia}`, link: `/app/tareas/${id}`,
    });
  }

  const filtered = tasks.filter((t) => filter === 'todas' || t.urgencia === filter);

  return (
    <div className="space-y-6" data-testid="admin-tasks-page">
      <header className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div>
          <p className="label-eyebrow">Operaciones</p>
          <h1 className="text-3xl font-black tracking-tight">Tareas</h1>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="bg-panel border-white/10 h-11 rounded-xl w-40" data-testid="tasks-filter"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-surface border-white/10">
              <SelectItem value="todas">Todas</SelectItem>
              <SelectItem value="rojo">🔴 Urgentes</SelectItem>
              <SelectItem value="amarillo">🟡 Medias</SelectItem>
              <SelectItem value="verde">🟢 A tiempo</SelectItem>
            </SelectContent>
          </Select>
          <button onClick={() => setOpen(true)} className="btn-gold flex items-center gap-2" data-testid="tasks-new-button"><Plus className="w-4 h-4" /> Crear</button>
        </div>
      </header>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t) => (
          <Link key={t.id} to={`/admin/tareas/${t.id}`} className="card-premium p-5 fade-up group" data-testid={`task-card-${t.id}`}>
            <div className="flex items-center gap-2 mb-3">
              <UrgBadge u={t.urgencia} />
              <span className="label-eyebrow">{t.estado}</span>
              <ChevronRight className="w-4 h-4 text-zinc-600 ml-auto group-hover:text-gold transition-colors" />
            </div>
            <h3 className="text-lg font-black tracking-tight line-clamp-2 mb-1">{t.titulo}</h3>
            <p className="text-sm text-zinc-400 line-clamp-2 font-light">{t.descripcion || '—'}</p>
            <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
              <p className="text-xs text-zinc-500 truncate">→ {t.assignee?.nombre || '—'}</p>
              <p className="text-[10px] text-zinc-600">{t.fecha_limite || ''}</p>
            </div>
            <div className="mt-3 flex gap-1" onClick={(e) => e.preventDefault()}>
              {['verde', 'amarillo', 'rojo'].map((u) => (
                <button key={u} onClick={(e) => { e.preventDefault(); setUrgencia(t.id, u, t.assignee_id, t.titulo); }}
                  className={`flex-1 h-2 rounded-full transition-all ${t.urgencia === u ? (u === 'rojo' ? 'bg-red-500' : u === 'amarillo' ? 'bg-yellow-400' : 'bg-green-500') : 'bg-white/10 hover:bg-white/20'}`}
                  data-testid={`task-${t.id}-urgencia-${u}`} aria-label={`Urgencia ${u}`} />
              ))}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full card-premium p-10 text-center text-zinc-500">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Sin tareas todavía. Crea la primera.</p>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-surface border-white/10" data-testid="tasks-create-dialog">
          <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="label-eyebrow mb-2 block">Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="task-titulo" />
            </div>
            <div>
              <Label className="label-eyebrow mb-2 block">Descripción</Label>
              <Textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={4} className="bg-panel border-white/10 rounded-xl" data-testid="task-desc" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="label-eyebrow mb-2 block">Asignar a</Label>
                <Select value={form.assignee_id} onValueChange={(v) => setForm({ ...form, assignee_id: v })}>
                  <SelectTrigger className="bg-panel border-white/10 h-11 rounded-xl" data-testid="task-assignee"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent className="bg-surface border-white/10">
                    {personal.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="label-eyebrow mb-2 block">Urgencia</Label>
                <Select value={form.urgencia} onValueChange={(v) => setForm({ ...form, urgencia: v })}>
                  <SelectTrigger className="bg-panel border-white/10 h-11 rounded-xl" data-testid="task-urgencia"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-surface border-white/10">
                    <SelectItem value="verde">🟢 A tiempo</SelectItem>
                    <SelectItem value="amarillo">🟡 Media</SelectItem>
                    <SelectItem value="rojo">🔴 Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="label-eyebrow mb-2 block">Fecha límite</Label>
              <Input type="date" value={form.fecha_limite} onChange={(e) => setForm({ ...form, fecha_limite: e.target.value })} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="task-fecha" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="btn-ghost">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-gold flex items-center gap-2" data-testid="task-save">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Crear y notificar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UrgBadge({ u }) {
  const m = u === 'rojo'
    ? { c: 'bg-red-500/15 text-red-400 border-red-500/30', t: 'URGENTE' }
    : u === 'amarillo'
    ? { c: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', t: 'MEDIA' }
    : { c: 'bg-green-500/15 text-green-400 border-green-500/30', t: 'A TIEMPO' };
  return <span className={`px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-wider ${m.c}`}>{m.t}</span>;
}
