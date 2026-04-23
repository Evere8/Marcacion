import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../../components/ui/input';
import { Checkbox } from '../../components/ui/checkbox';
import { Plus, Trash2, Repeat, CheckSquare } from 'lucide-react';
import { todayISO, formatDateEs } from '../../lib/format';
import { toast } from 'sonner';

export default function Checklist() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [text, setText] = useState('');
  const [repetible, setRepetible] = useState(false);

  async function load() {
    // Auto-generate today's repeatable items if missing.
    const { data: rep } = await supabase.from('checklists').select('titulo').eq('user_id', user.id).eq('repetible', true);
    const uniqueTitles = [...new Set((rep || []).map((r) => r.titulo))];
    for (const titulo of uniqueTitles) {
      const { count } = await supabase.from('checklists').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('fecha', todayISO()).eq('titulo', titulo);
      if ((count || 0) === 0) {
        await supabase.from('checklists').insert({ user_id: user.id, titulo, repetible: true, fecha: todayISO() });
      }
    }
    const { data } = await supabase.from('checklists').select('*').eq('user_id', user.id).order('fecha', { ascending: false }).order('created_at');
    setItems(data || []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  useRealtime(user ? `staff_checklist_${user.id}` : 'staff_checklist', (ch) => {
    if (!user) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'checklists', filter: `user_id=eq.${user.id}` }, load);
  }, [user?.id]);

  async function add() {
    if (!text.trim()) return;
    await supabase.from('checklists').insert({ user_id: user.id, titulo: text.trim(), repetible, fecha: todayISO() });
    setText(''); setRepetible(false);
    toast.success('Añadido');
  }
  async function toggle(i) {
    await supabase.from('checklists').update({ completado: !i.completado }).eq('id', i.id);
  }
  async function del(i) {
    await supabase.from('checklists').delete().eq('id', i.id);
  }

  const groups = items.reduce((acc, it) => { (acc[it.fecha] ||= []).push(it); return acc; }, {});

  return (
    <div className="space-y-5" data-testid="staff-checklist-page">
      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="card-premium p-4 flex gap-2 flex-wrap">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Nuevo pendiente…" className="flex-1 bg-panel border-white/10 rounded-xl h-11" data-testid="checklist-input" />
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <Checkbox checked={repetible} onCheckedChange={(v) => setRepetible(!!v)} data-testid="checklist-repetible" />
          <Repeat className="w-3.5 h-3.5" /> Diario
        </label>
        <button type="submit" className="btn-gold flex items-center gap-2" data-testid="checklist-add-button"><Plus className="w-4 h-4" /> Añadir</button>
      </form>

      {Object.keys(groups).length === 0 && (
        <div className="card-premium p-10 text-center text-zinc-500"><CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-50" /><p>Sin pendientes aún.</p></div>
      )}

      {Object.entries(groups).map(([fecha, list]) => (
        <section key={fecha}>
          <p className="label-eyebrow mb-2">{fecha === todayISO() ? 'Hoy' : formatDateEs(fecha)}</p>
          <div className="space-y-2">
            {list.map((i) => (
              <div key={i.id} className={`card-premium p-3 flex items-center gap-3 ${i.completado ? 'opacity-60' : ''}`} data-testid={`checklist-item-${i.id}`}>
                <Checkbox checked={i.completado} onCheckedChange={() => toggle(i)} className="border-white/20" data-testid={`checklist-toggle-${i.id}`} />
                <p className={`flex-1 text-sm ${i.completado ? 'line-through text-zinc-500' : ''}`}>{i.titulo}</p>
                {i.repetible && <Repeat className="w-3.5 h-3.5 text-gold" />}
                <button onClick={() => del(i)} className="p-2 hover:bg-red-500/10 rounded-lg" data-testid={`checklist-delete-${i.id}`}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
