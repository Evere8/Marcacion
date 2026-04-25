import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Plus, Trash2, Repeat, CheckSquare, Loader2 } from 'lucide-react';
import { todayISO, formatDateEs } from '../../lib/format';
import { toast } from 'sonner';

export default function AdminChecklist() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const [repetible, setRepetible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadedOnce = useRef(false);

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
        .order('created_at');
      if (error) throw error;
      setItems(data || []);
      loadedOnce.current = true;
      autoGenerateRepeatables(data || []).catch(() => {});
    } catch (e) {
      if (!silent) toast.error(e.message || 'No se pudo cargar');
    } finally {
      clearTimeout(failsafe);
      setLoading(false);
    }
  }

  async function autoGenerateRepeatables(current) {
    const today = todayISO();
    const repetibles = [...new Set(current.filter((i) => i.repetible).map((i) => i.titulo))];
    const todayTitles = new Set(current.filter((i) => i.fecha === today).map((i) => i.titulo));
    const missing = repetibles.filter((t) => !todayTitles.has(t));
    if (missing.length === 0) return;
    await supabase.from('checklists').insert(
      missing.map((titulo) => ({ user_id: user.id, titulo, repetible: true, fecha: today }))
    );
  }

  useEffect(() => {
    if (!user) return;
    refresh(false);
    // eslint-disable-next-line
  }, [user?.id]);

  useRealtime(user ? `admin_checklist_${user.id}` : 'admin_checklist', (ch) => {
    if (!user) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'checklists', filter: `user_id=eq.${user.id}` },
      () => refresh(true));
  }, [user?.id]);

  async function add() {
    if (!user || !text.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('checklists')
        .insert({ user_id: user.id, titulo: text.trim(), repetible, fecha: todayISO() })
        .select()
        .single();
      if (error) throw error;
      setItems((prev) => [data, ...prev]);
      setText('');
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
      user_id: user.id, titulo: i.titulo, repetible: i.repetible, fecha: tomorrow,
    });
    if (error) toast.error(error.message);
    else { toast.success(`Renovado para mañana: ${i.titulo}`); refresh(true); }
  }

  const groups = items.reduce((acc, it) => { (acc[it.fecha] ||= []).push(it); return acc; }, {});

  return (
    <div className="space-y-5 max-w-3xl" data-testid="admin-checklist-page">
      <header>
        <p className="label-eyebrow">Personal</p>
        <h1 className="text-3xl font-black tracking-tight">Mis pendientes</h1>
      </header>

      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="card-premium p-4 flex gap-2 flex-wrap">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nuevo pendiente del admin…"
          className="flex-1 bg-panel border-white/10 rounded-xl h-11" data-testid="admin-checklist-input" />
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <Checkbox checked={repetible} onCheckedChange={(v) => setRepetible(!!v)} data-testid="admin-checklist-repetible" />
          <Repeat className="w-3.5 h-3.5" /> Diario
        </label>
        <button type="submit" disabled={saving || !text.trim()} className="btn-gold flex items-center gap-2" data-testid="admin-checklist-add">
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
          <p className="label-eyebrow mb-2">{fecha === todayISO() ? 'Hoy' : formatDateEs(fecha)}</p>
          <div className="space-y-2">
            {list.map((i) => (
              <div key={i.id}
                className={`card-premium p-3 flex items-center gap-3 ${i.completado ? 'opacity-60' : ''}`}
                data-testid={`admin-checklist-item-${i.id}`}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-label={i.completado ? 'Desmarcar' : 'Completar'}
                  className={`shrink-0 w-7 h-7 rounded-md border flex items-center justify-center transition-all ${
                    i.completado ? 'bg-gold border-gold text-obsidian' : 'bg-transparent border-white/30 hover:border-gold'
                  }`}
                  data-testid={`admin-checklist-toggle-${i.id}`}
                >
                  {i.completado && <CheckSquare className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => editTitulo(i)}
                  className={`flex-1 text-sm text-left ${i.completado ? 'line-through text-zinc-500' : 'text-white'}`}
                  data-testid={`admin-checklist-edit-${i.id}`}
                >
                  {i.titulo}
                </button>
                {i.repetible && <Repeat className="w-3.5 h-3.5 text-gold shrink-0" />}
                <button
                  type="button"
                  onClick={() => renewForTomorrow(i)}
                  className="shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-gold/15 text-gold hover:bg-gold/25 border border-gold/30"
                  data-testid={`admin-checklist-renew-${i.id}`}
                  title="Renovar para mañana"
                >
                  Mañana
                </button>
                <button
                  type="button"
                  onClick={() => del(i)}
                  className="shrink-0 w-8 h-8 grid place-items-center hover:bg-red-500/10 rounded-lg"
                  data-testid={`admin-checklist-delete-${i.id}`}
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
