import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { formatTime, formatDateEs, todayISO, paraguayNow } from '../../lib/format';
import { mapsUrl, getHighAccuracyPosition, reverseGeocode } from '../../lib/gps';
import { Trash2, MapPin, Loader2, Crosshair } from 'lucide-react';
import { toast } from 'sonner';

export default function History() {
  const { user } = useAuth();
  const [range, setRange] = useState('dia');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const loadedOnce = useRef(false);

  const [editingId, setEditingId] = useState(null);

  async function refresh(silent = false) {
    if (!user) return;
    if (!silent) setLoading(true);
    const failsafe = setTimeout(() => setLoading(false), 8000);
    try {
      const today = new Date();
      let from = new Date();
      if (range === 'semana') from.setDate(today.getDate() - 7);
      else if (range === 'mes') from.setDate(today.getDate() - 30);
      const fromISO = from.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('marks')
        .select('*')
        .eq('user_id', user.id)
        .gte('fecha', range === 'dia' ? todayISO() : fromISO)
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false });
      if (error) throw error;
      setRows(data || []);
      loadedOnce.current = true;
    } catch (e) {
      if (!silent) toast.error(`Error al cargar: ${e.message || e}`);
    } finally {
      clearTimeout(failsafe);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    refresh(false);
    // eslint-disable-next-line
  }, [range, user?.id]);

  useRealtime(user ? `staff_history_${user.id}` : 'staff_history', (ch) => {
    if (!user) return;
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'marks', filter: `user_id=eq.${user.id}` },
      () => refresh(true));
  }, [user?.id]);

  async function del(r) {
    if (r.fecha !== todayISO()) { toast.error('Solo puedes borrar marcaciones del día.'); return; }
    if (!window.confirm('Eliminar marcación?')) return;
    setRows((p) => p.filter((x) => x.id !== r.id));
    try {
      const { error } = await supabase.from('marks').delete().eq('id', r.id);
      if (error) throw error;
      toast.success('Eliminada');
    } catch (e) { toast.error(e.message); refresh(true); }
  }

  async function editLocation(r) {
    if (r.fecha !== todayISO()) { toast.error('Solo puedes editar marcaciones del día.'); return; }
    if (!window.confirm('Vamos a actualizar tu ubicación con el GPS actual y la hora se ajustará al momento de este cambio. ¿Continuar?')) return;
    setEditingId(r.id);
    try {
      const pos = await getHighAccuracyPosition({ timeout: 20000 });
      const address = await reverseGeocode(pos.coords.latitude, pos.coords.longitude).catch(() => '');
      const { hora } = paraguayNow();
      const { error } = await supabase
        .from('marks')
        .update({
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          precision_m: pos.coords.accuracy,
          direccion_geolocalizada: address,
          hora,
        })
        .eq('id', r.id);
      if (error) throw error;
      toast.success('Ubicación actualizada con la hora actual');
      refresh(true);
    } catch (e) {
      toast.error(e.message || 'No se pudo obtener la ubicación');
    } finally {
      setEditingId(null);
    }
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

      {loading && !loadedOnce.current && (
        <div className="py-8 text-center text-zinc-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Cargando…
        </div>
      )}
      {!loading && loadedOnce.current && rows.length === 0 && (
        <p className="text-zinc-500 text-center py-10 text-sm">Sin marcaciones en este rango.</p>
      )}

      <div className="space-y-2">
        {rows.map((r) => {
          const today = r.fecha === todayISO();
          return (
            <div key={r.id} className="card-premium p-4 fade-up" data-testid={`history-item-${r.id}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className={`w-10 h-10 rounded-xl grid place-items-center ${r.tipo === 'entrada' ? 'bg-green-500/15 text-green-400' : 'bg-blue-500/15 text-blue-400'}`}>
                  <span className="font-black text-[10px] uppercase">{r.tipo === 'entrada' ? 'IN' : 'OUT'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold">{formatDateEs(r.fecha)} · {formatTime(r.hora)}</p>
                  <p className="text-xs text-zinc-500 truncate">{r.direccion_geolocalizada || (r.latitud != null ? `${r.latitud?.toFixed(4)}, ${r.longitud?.toFixed(4)}` : '—')}</p>
                </div>
                {r.retraso_minutos > 0 && <span className="px-2 py-1 rounded-full bg-yellow-500/15 text-yellow-400 text-[10px] font-bold uppercase">+{r.retraso_minutos}m</span>}
                {r.latitud != null && (
                  <a href={mapsUrl(r.latitud, r.longitud)} target="_blank" rel="noreferrer"
                    className="shrink-0 w-9 h-9 rounded-xl grid place-items-center bg-gold/10 text-gold hover:bg-gold/20 border border-gold/30 transition-colors"
                    title="Ver ubicación"
                    data-testid={`history-view-location-${r.id}`}>
                    <MapPin className="w-4 h-4" />
                  </a>
                )}
                {today && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => editLocation(r)}
                      disabled={editingId === r.id}
                      className="p-2 rounded-lg hover:bg-gold/10 disabled:opacity-50"
                      data-testid={`history-edit-location-${r.id}`}
                      title="Actualizar ubicación con GPS (la hora se ajustará al momento del cambio)"
                    >
                      {editingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" /> : <Crosshair className="w-3.5 h-3.5 text-gold" />}
                    </button>
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
