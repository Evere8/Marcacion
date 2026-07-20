import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { applyRealtimeChange } from '../../lib/realtime';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Plus, Trash2, Repeat, CheckSquare, Loader2, Clock } from 'lucide-react';
import { todayISO, formatDateEs, formatTime, paraguayTimeHHMM } from '../../lib/format';
import { autoGenerateRepeatablesByHour } from '../../lib/checklistAuto';
import { toast } from 'sonner';

export default function Checklist() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const [hora, setHora] = useState('');
  const [repetible, setRepetible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadedOnce = useRef(false);
  const itemsRef = useRef([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  async function refresh(silent = false) {
    if (!user) return;
    if (!silent) setLoading(true);
    const failsafe = setTimeout(() => setLoading(false), 8000);
    try {
      const { data, error } = await supabase
        .from('checklists')
        .select('*')
        .eq('user_id', user.id)
        .order('fecha', { ascending: false })
        .order('hora', { ascending: true, nullsFirst: false })
        .order('created_at');
      if (error) throw error;
      setItems(data || []);
      loadedOnce.current = true;
      autoGenerateRepeatablesByHour(user.id, data || []).catch(() => {});
    } catch (e) {
      if (!silent) toast.error(e.message || 'No se pudo cargar');
    } finally {
      clearTimeout(failsafe);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    refresh(false);
    // Sin polling: la lista se mantiene con Realtime (granular). Los
    // repetibles por hora se regeneran al montar y al volver a primer plano.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      autoGenerateRepeatablesByHour(user.id, itemsRef.current).catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line
  }, [user?.id]);

  useRealtime(user ? `staff_checklist_${user.id}` : 'staff_checklist', (ch) => {
    if (!user) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'checklists', filter: `user_id=eq.${user.id}` },
      (payload) => applyRealtimeChange(setItems, payload));
  }, [user?.id]);

  async function add() {
    if (!user || !text.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('checklists')
        .insert({
          user_id: user.id,
          titulo: text.trim(),
          repetible,
          hora: hora || null,
          fecha: todayISO(),
        })
        .select()
        .single();
      if (error) throw error;
      setItems((prev) => [data, ...prev]);
      setText('');
      setHora('');
      setRepetible(false);
      toast.success('Añadido');
    } catch (e) {
      toast.error(`No se pudo guardar: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(i) {
    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, completado: !i.completado } : x)));
    try {
      const { error } = await supabase.from('checklists').update({ completado: !i.completado }).eq('id', i.id);
      if (error) throw error;
    } catch (e) {
      setItems((prev) => prev.map((x) => (x.id === i.id ? i : x)));
      toast.error(e.message);
    }
  }

  async function editTitulo(i) {
    const nuevo = window.prompt('Editar pendiente', i.titulo);
    if (nuevo == null || !nuevo.trim() || nuevo.trim() === i.titulo) return;
    setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, titulo: nuevo.trim() } : x)));
    try {
      const { error } = await supabase.from('checklists').update({ titulo: nuevo.trim() }).eq('id', i.id);
      if (error) throw error;
      toast.success('Editado');
    } catch (e) {
      setItems((prev) => prev.map((x) => (x.id === i.id ? i : x)));
      toast.error(e.message);
    }
  }

  async function editHora(i) {
    const nuevo = window.prompt('Hora (HH:MM, vacío para quitar)', i.hora ? i.hora.slice(0, 5) : '');
    if (nuevo == null) return;
    const trimmed = nuevo.trim();
    const newHora = trimmed === '' ? null : (/^\d{1,2}:\d{2}$/.test(trimmed) ? trimmed : null);
    if (trimmed && !newHora) { toast.error('Formato HH:MM (ej. 08:30)'); return; }
    const prev = i.hora;
    setItems((p) => p.map((x) => (x.id === i.id ? { ...x, hora: newHora } : x)));
    const { error } = await supabase.from('checklists').update({ hora: newHora }).eq('id', i.id);
    if (error) {
      setItems((p) => p.map((x) => (x.id === i.id ? { ...x, hora: prev } : x)));
      toast.error(error.message);
    } else { toast.success('Hora actualizada'); }
  }

  async function del(i) {
    if (!window.confirm('Eliminar pendiente?')) return;
    setItems((prev) => prev.filter((x) => x.id !== i.id));
    try {
      const { error } = await supabase.from('checklists').delete().eq('id', i.id);
      if (error) throw error;
    } catch (e) {
      toast.error(e.message);
      refresh(true);
    }
  }

  async function renewForTomorrow(i) {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    const tomorrow = t.toLocaleDateString('en-CA');
    const { error } = await supabase.from('checklists').insert({
      user_id: user.id, titulo: i.titulo, repetible: i.repetible, hora: i.hora || null, fecha: tomorrow,
    });
    if (error) toast.error(error.message);
    else { toast.success(`Renovado para mañana: ${i.titulo}`); refresh(true); }
  }

  const groups = items.reduce((acc, it) => { (acc[it.fecha] ||= []).push(it); return acc; }, {});
  const pyTime = paraguayTimeHHMM();

  return (
    <div className="space-y-5" data-testid="staff-checklist-page">
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="card-premium p-4 flex gap-2 flex-wrap">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nuevo pendiente…"
          className="flex-1 min-w-[160px] bg-panel border-white/10 rounded-xl h-11" data-testid="checklist-input" />
        <div className="flex items-center gap-1 rounded-xl bg-panel border border-white/10 px-2 h-11" title="Hora opcional">
          <Clock className="w-3.5 h-3.5 text-zinc-500" />
          <Input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="w-[110px] bg-transparent border-0 h-9 px-1 text-sm focus-visible:ring-0"
            data-testid="checklist-hora-input"
            aria-label="Hora del pendiente"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400 px-2">
          <Checkbox checked={repetible} onCheckedChange={(v) => setRepetible(!!v)} data-testid="checklist-repetible" />
          <Repeat className="w-3.5 h-3.5" /> Diario
        </label>
        <button type="submit" disabled={saving || !text.trim()} className="btn-gold flex items-center gap-2" data-testid="checklist-add-button">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Añadir
        </button>
      </form>

      {loading && !loadedOnce.current && (
        <div className="py-8 text-center text-zinc-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      )}

      {!loading && loadedOnce.current && Object.keys(groups).length === 0 && (
        <div className="card-premium p-10 text-center text-zinc-500">
          <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>Sin pendientes aún.</p>
        </div>
      )}

      {Object.entries(groups).map(([fecha, list]) => (
        <section key={fecha}>
          <p className="label-eyebrow mb-2">{fecha === todayISO() ? `Hoy · ${pyTime} PY` : formatDateEs(fecha)}</p>
          <div className="space-y-2">
            {list.map((i) => (
              <div key={i.id}
                className={`card-premium p-3 flex items-center gap-3 ${i.completado ? 'opacity-60' : ''}`}
                data-testid={`checklist-item-${i.id}`}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-label={i.completado ? 'Desmarcar' : 'Completar'}
                  className={`shrink-0 w-7 h-7 rounded-md border flex items-center justify-center transition-all ${
                    i.completado ? 'bg-gold border-gold text-obsidian' : 'bg-transparent border-white/30 hover:border-gold'
                  }`}
                  data-testid={`checklist-toggle-${i.id}`}
                >
                  {i.completado && <CheckSquare className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => editTitulo(i)}
                  className={`flex-1 text-sm text-left ${i.completado ? 'line-through text-zinc-500' : 'text-white'}`}
                  data-testid={`checklist-edit-${i.id}`}
                >
                  {i.titulo}
                </button>
                <button
                  type="button"
                  onClick={() => editHora(i)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold tracking-wider border ${
                    i.hora ? 'bg-gold/15 text-gold border-gold/30' : 'bg-white/5 text-zinc-500 border-white/10 hover:text-white'
                  }`}
                  data-testid={`checklist-hora-${i.id}`}
                  title="Asignar / editar hora"
                >
                  <Clock className="w-3 h-3" />{i.hora ? formatTime(i.hora) : 'Hora'}
                </button>
                {i.repetible && <Repeat className="w-3.5 h-3.5 text-gold shrink-0" />}
                <button
                  type="button"
                  onClick={() => renewForTomorrow(i)}
                  className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-gold/15 text-gold hover:bg-gold/25 border border-gold/30"
                  data-testid={`checklist-renew-${i.id}`}
                  title="Renovar para mañana"
                >
                  Mañana
                </button>
                <button
                  type="button"
                  onClick={() => del(i)}
                  className="shrink-0 w-8 h-8 grid place-items-center hover:bg-red-500/10 rounded-lg"
                  data-testid={`checklist-delete-${i.id}`}
                  aria-label="Eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
