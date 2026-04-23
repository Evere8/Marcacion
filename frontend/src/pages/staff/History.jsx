import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { formatTime, formatDateEs, todayISO } from '../../lib/format';
import { Trash2, Edit2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function History() {
  const { user } = useAuth();
  const [range, setRange] = useState('dia'); // dia|semana|mes
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const today = new Date();
    let from = new Date();
    if (range === 'semana') from.setDate(today.getDate() - 7);
    else if (range === 'mes') from.setDate(today.getDate() - 30);
    const fromISO = from.toISOString().slice(0, 10);
    const { data } = await supabase.from('marks').select('*').eq('user_id', user.id)
      .gte('fecha', range === 'dia' ? todayISO() : fromISO).order('fecha', { ascending: false }).order('hora', { ascending: false });
    setRows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [range]);
  useRealtime(user ? `staff_history_${user.id}` : 'staff_history', (ch) => {
    if (!user) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'marks', filter: `user_id=eq.${user.id}` }, load);
  }, [user?.id]);

  async function del(r) {
    if (r.fecha !== todayISO()) { toast.error('Solo puedes borrar marcaciones del día.'); return; }
    if (!window.confirm('Eliminar marcación?')) return;
    await supabase.from('marks').delete().eq('id', r.id);
    toast.success('Eliminada');
  }
  async function editHora(r) {
    if (r.fecha !== todayISO()) { toast.error('Solo puedes editar marcaciones del día.'); return; }
    const nueva = window.prompt('Nueva hora (HH:MM)', formatTime(r.hora));
    if (!nueva || !/^\d{2}:\d{2}$/.test(nueva)) return;
    await supabase.from('marks').update({ hora: nueva + ':00' }).eq('id', r.id);
    toast.success('Hora actualizada');
  }

  return (
    <div className="space-y-4" data-testid="staff-history-page">
      <div className="flex gap-2" role="tablist">
        {['dia', 'semana', 'mes'].map((k) => (
          <button key={k} onClick={() => setRange(k)}
            className={`flex-1 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all ${range === k ? 'bg-gold text-obsidian' : 'bg-white/5 text-zinc-400'}`}
            data-testid={`history-range-${k}`}>{k === 'dia' ? 'Día' : k === 'semana' ? 'Semana' : 'Mes'}</button>
        ))}
      </div>

      {loading && <div className="py-8 text-center text-zinc-500"><Loader2 className="w-5 h-5 animate-spin inline" /></div>}
      {!loading && rows.length === 0 && <p className="text-zinc-500 text-center py-10 text-sm">Sin marcaciones en este rango.</p>}

      <div className="space-y-2">
        {rows.map((r) => {
          const today = r.fecha === todayISO();
          return (
            <div key={r.id} className="card-premium p-4 fade-up" data-testid={`history-item-${r.id}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl grid place-items-center ${r.tipo === 'entrada' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'}`}>
                  <span className="font-black text-[10px] uppercase">{r.tipo === 'entrada' ? 'IN' : 'OUT'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold">{formatDateEs(r.fecha)} · {formatTime(r.hora)}</p>
                  <p className="text-xs text-zinc-500 truncate">{r.direccion_geolocalizada || `${r.latitud?.toFixed(4)}, ${r.longitud?.toFixed(4)}`}</p>
                </div>
                {r.fake_gps_detected && <span className="px-2 py-1 rounded-full bg-red-500/15 text-red-400 text-[10px] font-bold uppercase">Fake</span>}
                {r.retraso_minutos > 0 && !r.fake_gps_detected && <span className="px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-400 text-[10px] font-bold uppercase">+{r.retraso_minutos}m</span>}
                {today && (
                  <div className="flex gap-1">
                    <button onClick={() => editHora(r)} className="p-2 rounded-lg hover:bg-white/5" data-testid={`history-edit-${r.id}`}><Edit2 className="w-3.5 h-3.5 text-zinc-400" /></button>
                    <button onClick={() => del(r)} className="p-2 rounded-lg hover:bg-red-500/10" data-testid={`history-delete-${r.id}`}><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
