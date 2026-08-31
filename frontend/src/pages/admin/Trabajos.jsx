import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { applyRealtimeChange } from '../../lib/realtime';
import { Calendar, Download, Loader2, ClipboardList, FileSpreadsheet, Plus } from 'lucide-react';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Avatar } from './Dashboard';
import { downloadExcel, cellStyles } from '../../lib/excelExport';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

function todayPY() {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' });
  return fmt.format(new Date());
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Asuncion' });
  return fmt.format(d);
}

// Asigna un color de marca a cada chofer (estable por id)
const CHOFER_COLORS = [
  { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', excelHeader: '#D4AF37' },
  { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', excelHeader: '#10B981' },
  { bg: 'bg-sky-500/10', border: 'border-sky-500/30', text: 'text-sky-300', excelHeader: '#0EA5E9' },
  { bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30', text: 'text-fuchsia-300', excelHeader: '#D946EF' },
  { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-300', excelHeader: '#F43F5E' },
  { bg: 'bg-violet-500/10', border: 'border-violet-500/30', text: 'text-violet-300', excelHeader: '#8B5CF6' },
  { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-300', excelHeader: '#F97316' },
  { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-300', excelHeader: '#14B8A6' },
];

function colorFor(idx) { return CHOFER_COLORS[idx % CHOFER_COLORS.length]; }

export default function AdminTrabajos() {
  const [from, setFrom] = useState(daysAgo(6));
  const [to, setTo] = useState(todayPY());
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [creOpen, setCreOpen] = useState(false);
  const [creForm, setCreForm] = useState({ user_id: '', detalle: '', cantidad: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: t }, { data: p }] = await Promise.all([
      supabase.from('trabajos').select('*').gte('fecha', from).lte('fecha', to).order('fecha', { ascending: false }).order('hora', { ascending: false }),
      supabase.from('profiles').select('id,nombre,email,foto_perfil').eq('rol', 'personal'),
    ]);
    setRows(t || []);
    setProfiles(p || []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);
  useRealtime('admin_trabajos', (ch) => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'trabajos' },
      (p) => applyRealtimeChange(setRows, p, { belongs: (r) => r.fecha >= from && r.fecha <= to }));
  }, [from, to]);

  // Agrupar por chofer
  const grupos = useMemo(() => {
    const profById = Object.fromEntries(profiles.map((p) => [p.id, p]));
    const byUser = {};
    for (const r of rows) {
      if (!byUser[r.user_id]) {
        const p = profById[r.user_id];
        byUser[r.user_id] = {
          id: r.user_id,
          nombre: p?.nombre || 'Empleado',
          email: p?.email || '—',
          foto_perfil: p?.foto_perfil,
          items: [],
          total: 0,
        };
      }
      byUser[r.user_id].items.push(r);
      byUser[r.user_id].total += Number(r.cantidad || 0);
    }
    return Object.values(byUser).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [rows, profiles]);

  const totalGeneral = useMemo(() => grupos.reduce((acc, g) => acc + g.total, 0), [grupos]);

  async function crearTrabajo() {
    if (!creForm.user_id) { toast.error('Selecciona un personal'); return; }
    if (!creForm.detalle.trim()) { toast.error('La descripción es obligatoria'); return; }
    const cant = creForm.cantidad === '' ? 0 : Number(creForm.cantidad);
    if (Number.isNaN(cant)) { toast.error('El precio debe ser un número'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('trabajos').insert({
        user_id: creForm.user_id, detalle: creForm.detalle.trim(), cantidad: cant,
      });
      if (error) throw error;
      toast.success('Trabajo cargado');
      setCreOpen(false); setCreForm({ user_id: '', detalle: '', cantidad: '' });
      load();
    } catch (e) { toast.error(e.message || 'Error al cargar'); } finally { setSaving(false); }
  }

  function exportarExcel() {
    if (grupos.length === 0) { toast.error('Sin trabajos en el rango'); return; }
    const fmtDur = (s) => {
      if (!s) return '—';
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      return `${h}h ${m}m ${sec}s`;
    };
    const sections = grupos.map((g, idx) => {
      const color = colorFor(idx);
      const durTotalSec = g.items.reduce((acc, it) => acc + (it.duracion_segundos || 0), 0);
      return {
        title: `${g.nombre} · ${g.email}  ·  Trabajos: ${g.items.length}  ·  Cantidad total: ${g.total}  ·  Tiempo total: ${fmtDur(durTotalSec)}`,
        headerColor: color.excelHeader,
        headers: ['Fecha', 'Hora carga', 'Detalle', 'Cantidad', 'Inicio', 'Fin', 'Duración', 'Editado'],
        rows: g.items.map((it) => [
          it.fecha,
          it.hora?.slice(0, 5) || '—',
          it.detalle,
          it.cantidad,
          it.iniciado_en ? new Date(it.iniciado_en).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—',
          it.finalizado_en ? new Date(it.finalizado_en).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—',
          fmtDur(it.duracion_segundos),
          it.updated_at && it.updated_at !== it.created_at ? new Date(it.updated_at).toLocaleString('es-PY') : '—',
        ]),
        cellStyles: g.items.map(() => ['', '', '', cellStyles.bold, cellStyles.greenLight, cellStyles.blueLight, cellStyles.bold, '']),
      };
    });
    // Sección resumen al inicio
    const durGeneralSec = grupos.reduce((acc, g) => acc + g.items.reduce((a, it) => a + (it.duracion_segundos || 0), 0), 0);
    sections.unshift({
      title: 'Resumen por chofer',
      headerColor: '#0b0b0b',
      headers: ['Chofer', 'Email', 'Trabajos', 'Cantidad total', 'Tiempo total'],
      rows: grupos.map((g) => [
        g.nombre, g.email, g.items.length, g.total,
        fmtDur(g.items.reduce((acc, it) => acc + (it.duracion_segundos || 0), 0)),
      ]),
      cellStyles: grupos.map(() => [cellStyles.bold, '', cellStyles.blueLight, cellStyles.greenLight, cellStyles.bold]),
    });
    downloadExcel({
      filename: `alfatwin-trabajos-${from}_${to}`,
      title: 'ALFATWIN · Reporte de trabajos',
      subtitle: `Rango: ${from} → ${to}  ·  Choferes: ${grupos.length}  ·  Trabajos: ${rows.length}  ·  Cantidad total: ${totalGeneral}  ·  Tiempo total: ${fmtDur(durGeneralSec)}`,
      sections,
    });
    toast.success('Excel descargado');
  }

  return (
    <div className="space-y-6" data-testid="admin-trabajos-page">
      <header className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div>
          <p className="label-eyebrow">Operaciones</p>
          <h1 className="text-3xl font-black tracking-tight">Trabajos del personal</h1>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={() => setCreOpen(true)} className="btn-gold flex items-center gap-2" data-testid="admin-trabajos-new">
            <Plus className="w-4 h-4" /> Cargar trabajo
          </button>
          <button onClick={exportarExcel} className="btn-ghost flex items-center gap-2" data-testid="admin-trabajos-export">
            <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
          </button>
        </div>
      </header>

      <div className="card-premium p-4 flex items-end gap-3 flex-wrap" data-testid="admin-trabajos-filters">
        <Calendar className="w-4 h-4 text-gold shrink-0 mb-3" />
        <div className="min-w-[140px]">
          <Label className="label-eyebrow mb-1 block">Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-panel border-white/10 h-10 rounded-xl" data-testid="admin-trabajos-from" />
        </div>
        <div className="min-w-[140px]">
          <Label className="label-eyebrow mb-1 block">Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-panel border-white/10 h-10 rounded-xl" data-testid="admin-trabajos-to" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => { setFrom(todayPY()); setTo(todayPY()); }} className="btn-ghost !text-xs !py-2" data-testid="admin-trabajos-rng-hoy">Hoy</button>
          <button onClick={() => { setFrom(daysAgo(6)); setTo(todayPY()); }} className="btn-ghost !text-xs !py-2" data-testid="admin-trabajos-rng-week">7 días</button>
          <button onClick={() => { setFrom(daysAgo(29)); setTo(todayPY()); }} className="btn-ghost !text-xs !py-2" data-testid="admin-trabajos-rng-month">30 días</button>
        </div>
        <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-2 text-center ml-auto">
          <p className="text-[10px] uppercase tracking-wider text-gold">Cantidad total</p>
          <p className="text-2xl font-black gold-gradient-text">{totalGeneral}</p>
        </div>
      </div>

      {loading && <div className="py-10 text-center text-zinc-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>}

      {!loading && grupos.length === 0 && (
        <div className="card-premium p-10 text-center text-zinc-500">
          <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Sin trabajos registrados en este rango.</p>
        </div>
      )}

      <div className="space-y-5">
        {grupos.map((g, idx) => {
          const color = colorFor(idx);
          return (
            <section key={g.id} className={`card-premium p-0 overflow-hidden border-l-4 ${color.border}`} data-testid={`admin-trabajos-chofer-${g.id}`}>
              <header className={`flex items-center justify-between gap-3 p-4 ${color.bg} border-b ${color.border}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar src={g.foto_perfil} name={g.nombre} size={42} />
                  <div className="min-w-0">
                    <p className={`label-eyebrow ${color.text}`}>Chofer</p>
                    <h2 className="text-lg font-black tracking-tight truncate">{g.nombre}</h2>
                    <p className="text-[11px] text-zinc-500 truncate">{g.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-zinc-500">Trabajos</p>
                    <p className="text-base font-black">{g.items.length}</p>
                  </div>
                  <div className={`rounded-lg border ${color.border} ${color.bg} px-3 py-1.5 text-center`}>
                    <p className={`text-[9px] uppercase tracking-wider ${color.text}`}>Total</p>
                    <p className="text-base font-black">{g.total}</p>
                  </div>
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-black/40 text-[10px] uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Hora</th>
                      <th className="px-3 py-2 text-left">Detalle</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-left">Duración viaje</th>
                      <th className="px-3 py-2 text-left">Editado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it) => {
                      const dur = it.duracion_segundos || 0;
                      const h = Math.floor(dur / 3600), m = Math.floor((dur % 3600) / 60), sec = dur % 60;
                      const durLabel = it.iniciado_en && it.finalizado_en
                        ? `${h}h ${m}m ${sec}s`
                        : it.iniciado_en && !it.finalizado_en ? 'En curso…' : '—';
                      const durClass = it.finalizado_en
                        ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                        : it.iniciado_en ? 'bg-green-500/15 text-green-300 border-green-500/30 animate-pulse' : 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
                      return (
                        <tr key={it.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                          <td className="px-3 py-2 font-bold whitespace-nowrap">{it.fecha}</td>
                          <td className="px-3 py-2 font-mono text-zinc-300">{it.hora?.slice(0, 5)}</td>
                          <td className="px-3 py-2 text-zinc-200 whitespace-pre-wrap break-words">{it.detalle}</td>
                          <td className="px-3 py-2 text-right">
                            <span className={`inline-block px-2.5 py-1 rounded-md border text-xs font-black ${color.bg} ${color.border} ${color.text}`}>{it.cantidad}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold ${durClass}`}>{durLabel}</span>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-zinc-500">
                            {it.updated_at && it.updated_at !== it.created_at
                              ? new Date(it.updated_at).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={creOpen} onOpenChange={setCreOpen}>
        <DialogContent className="bg-surface border-white/10" data-testid="admin-trabajos-create-dialog">
          <DialogHeader>
            <DialogTitle>Cargar trabajo</DialogTitle>
            <DialogDescription className="sr-only">Asignar un trabajo a un personal con descripción y precio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="label-eyebrow mb-2 block">Personal</Label>
              <Select value={creForm.user_id} onValueChange={(v) => setCreForm({ ...creForm, user_id: v })}>
                <SelectTrigger className="bg-panel border-white/10 h-11 rounded-xl" data-testid="admin-trabajos-personal"><SelectValue placeholder="Seleccionar personal" /></SelectTrigger>
                <SelectContent className="bg-surface border-white/10 max-h-64">
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-eyebrow mb-2 block">Descripción</Label>
              <Textarea value={creForm.detalle} onChange={(e) => setCreForm({ ...creForm, detalle: e.target.value })} rows={3} className="bg-panel border-white/10 rounded-xl" data-testid="admin-trabajos-detalle" placeholder="Detalle del trabajo" />
            </div>
            <div>
              <Label className="label-eyebrow mb-2 block">Precio</Label>
              <Input type="number" inputMode="numeric" value={creForm.cantidad} onChange={(e) => setCreForm({ ...creForm, cantidad: e.target.value })} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="admin-trabajos-precio" placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setCreOpen(false)} className="btn-ghost">Cancelar</button>
            <button onClick={crearTrabajo} disabled={saving} className="btn-gold flex items-center gap-2" data-testid="admin-trabajos-save">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Cargar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
