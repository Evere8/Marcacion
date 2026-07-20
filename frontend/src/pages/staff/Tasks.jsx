import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { applyRealtimeChange } from '../../lib/realtime';
import { useAuth } from '../../contexts/AuthContext';
import { ClipboardList, Plus, Loader2, Pencil, Trash2, Calendar, Check, X, MessageSquare, ChevronRight } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { toast } from 'sonner';

function todayPY() {
  // Fecha "hoy" en zona Paraguay
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' });
  return fmt.format(new Date()); // YYYY-MM-DD
}

function nowPY_HHMMSS() {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Asuncion', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  return fmt.format(new Date());
}

const emptyForm = { id: null, detalle: '', cantidad: '' };

export default function StaffTrabajos() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [dateFilter, setDateFilter] = useState(todayPY());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminTasks, setAdminTasks] = useState([]);

  async function loadAdminTasks() {
    if (!user) return;
    const { data } = await supabase.from('tasks')
      .select('id,titulo,descripcion,estado,urgencia,assignee_id,admin_id,fecha_limite,created_at')
      .eq('assignee_id', user.id)
      .neq('estado', 'completada')
      .order('created_at', { ascending: false })
      .limit(20);
    // Solo mostrar tareas creadas por admin (admin_id no null)
    setAdminTasks((data || []).filter((t) => t.admin_id));
  }
  useEffect(() => { loadAdminTasks(); /* eslint-disable-next-line */ }, [user?.id]);
  useRealtime(user ? `staff_admintasks_${user.id}` : 'staff_admintasks', (ch) => {
    if (!user) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assignee_id=eq.${user.id}` },
      (p) => applyRealtimeChange(setAdminTasks, p, { belongs: (r) => r.estado !== 'completada' && !!r.admin_id }));
  }, [user?.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('trabajos')
      .select('id,user_id,detalle,cantidad,estado,fecha,hora,iniciado_en,finalizado_en,duracion_segundos,creado_por_admin,created_at')
      .eq('user_id', user.id)
      .eq('fecha', dateFilter)
      .order('hora', { ascending: false });
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dateFilter, user?.id]);
  useRealtime(user ? `staff_trab_${user.id}` : 'staff_trab', (ch) => {
    if (!user) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'trabajos', filter: `user_id=eq.${user.id}` },
      (p) => applyRealtimeChange(setRows, p, { belongs: (r) => r.fecha === dateFilter }));
  }, [user?.id, dateFilter]);

  function openNew() { setForm(emptyForm); setOpen(true); }
  function openEdit(r) { setForm({ id: r.id, detalle: r.detalle, cantidad: String(r.cantidad ?? '') }); setOpen(true); }

  async function save() {
    if (!form.detalle.trim()) { toast.error('El detalle es obligatorio'); return; }
    const cantNum = form.cantidad === '' ? 0 : Number(form.cantidad);
    if (Number.isNaN(cantNum)) { toast.error('La cantidad debe ser un número'); return; }
    setSaving(true);
    try {
      if (form.id) {
        const { error } = await supabase.from('trabajos').update({
          detalle: form.detalle.trim(),
          cantidad: cantNum,
        }).eq('id', form.id);
        if (error) throw error;
        toast.success('Trabajo actualizado');
      } else {
        const { error } = await supabase.from('trabajos').insert({
          user_id: user.id,
          detalle: form.detalle.trim(),
          cantidad: cantNum,
          fecha: todayPY(),
          hora: nowPY_HHMMSS(),
        });
        if (error) throw error;
        toast.success('Trabajo registrado');
        // Si el usuario está filtrando otra fecha, saltar a HOY para que vea su nuevo trabajo
        if (dateFilter !== todayPY()) setDateFilter(todayPY());
      }
      setOpen(false); setForm(emptyForm); load();
    } catch (e) { toast.error(e.message || 'Error'); } finally { setSaving(false); }
  }

  async function del(r) {
    if (!window.confirm(`Eliminar trabajo "${r.detalle.slice(0, 40)}"?`)) return;
    const { error } = await supabase.from('trabajos').delete().eq('id', r.id);
    if (error) toast.error(error.message); else { toast.success('Eliminado'); load(); }
  }

  const total = useMemo(() => rows.reduce((acc, r) => acc + Number(r.cantidad || 0), 0), [rows]);

  return (
    <div className="space-y-5" data-testid="staff-trabajos-page">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="label-eyebrow">Mis trabajos</p>
          <h1 className="text-2xl font-black tracking-tight">Tareas del día</h1>
        </div>
        <button onClick={openNew} className="btn-gold flex items-center gap-2" data-testid="staff-trabajos-new">
          <Plus className="w-4 h-4" /> Nuevo
        </button>
      </header>

      {adminTasks.length > 0 && (
        <section className="card-premium p-4" data-testid="staff-admintasks-section">
          <div className="flex items-center justify-between mb-3">
            <p className="label-eyebrow text-gold">Tareas del jefe · {adminTasks.length}</p>
            <MessageSquare className="w-4 h-4 text-gold" />
          </div>
          <div className="space-y-2">
            {adminTasks.map((t) => (
              <Link key={t.id} to={`/app/tareas-jefe/${t.id}`} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors" data-testid={`staff-admintask-${t.id}`}>
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${t.urgencia === 'rojo' ? 'bg-red-500' : t.urgencia === 'amarillo' ? 'bg-yellow-400' : 'bg-green-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate text-sm">{t.titulo}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{t.estado.replace('_', ' ')} · {t.descripcion || '—'}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="card-premium p-4 flex items-center gap-3 flex-wrap" data-testid="staff-trabajos-filter">
        <Calendar className="w-4 h-4 text-gold shrink-0" />
        <div className="flex-1 min-w-[140px]">
          <Label className="label-eyebrow mb-1 block">Filtrar por fecha</Label>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value || todayPY())}
            className="bg-panel border-white/10 h-10 rounded-xl"
            data-testid="staff-trabajos-date"
          />
        </div>
        <button
          onClick={() => setDateFilter(todayPY())}
          className="btn-ghost !text-xs !py-2 !px-3"
          data-testid="staff-trabajos-today"
        >Hoy</button>
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-gold">Total cantidad</p>
          <p className="text-xl font-black gold-gradient-text">{total}</p>
        </div>
      </div>

      {loading && <div className="py-10 text-center text-zinc-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>}

      {!loading && rows.length === 0 && (
        <div className="card-premium p-10 text-center text-zinc-500">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Sin trabajos registrados en esta fecha.</p>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="card-premium p-4 fade-up" data-testid={`staff-trabajo-${r.id}`}>
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-gold/15 border border-gold/30 text-gold px-3 py-2 text-center shrink-0 min-w-[68px]">
                <p className="text-[10px] uppercase tracking-wider">Cantidad</p>
                <p className="text-xl font-black">{r.cantidad}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white whitespace-pre-wrap break-words">{r.detalle}</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {r.fecha} · {r.hora?.slice(0, 5)}
                  {r.duracion_segundos ? ` · ⏱ ${Math.floor(r.duracion_segundos / 3600)}h ${Math.floor((r.duracion_segundos % 3600) / 60)}m` : (r.iniciado_en && !r.finalizado_en) ? ' · ⏱ en curso' : ''}
                  {r.updated_at && r.updated_at !== r.created_at ? ' · editado' : ''}
                </p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => openEdit(r)} className="btn-ghost !px-2 !py-1.5" data-testid={`staff-trabajo-edit-${r.id}`} aria-label="Editar"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => del(r)} className="btn-ghost !px-2 !py-1.5 hover:!bg-red-500/10 hover:!text-red-400" data-testid={`staff-trabajo-del-${r.id}`} aria-label="Eliminar"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-surface border-white/10" data-testid="staff-trabajos-dialog">
          <DialogHeader><DialogTitle>{form.id ? 'Editar trabajo' : 'Nuevo trabajo'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="label-eyebrow mb-2 block">Detalle</Label>
              <Textarea
                value={form.detalle}
                onChange={(e) => setForm({ ...form, detalle: e.target.value })}
                rows={4}
                placeholder="Describe el trabajo realizado…"
                className="bg-panel border-white/10 rounded-xl"
                data-testid="staff-trabajo-detalle"
                autoFocus
              />
            </div>
            <div>
              <Label className="label-eyebrow mb-2 block">Cantidad</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                value={form.cantidad}
                onChange={(e) => setForm({ ...form, cantidad: e.target.value.replace(/[^\d.,\-]/g, '').replace(',', '.') })}
                placeholder="0"
                className="bg-panel border-white/10 h-11 rounded-xl"
                data-testid="staff-trabajo-cantidad"
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="btn-ghost flex items-center gap-2"><X className="w-4 h-4" /> Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-gold flex items-center gap-2" data-testid="staff-trabajo-save">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {form.id ? 'Guardar cambios' : 'Crear'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
