import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2, FileText, Send, Download, MapPin, Camera, Clock, FileSpreadsheet, Calendar } from 'lucide-react';
import { formatTime, formatDateEs, todayISO, computeMarkDelay, minutesToText, isWorkingDayPY, eachDayISO, buildShifts, addDaysISO } from '../../lib/format';
import { mapsUrl } from '../../lib/gps';
import { deleteMarkPhoto } from '../../lib/upload';
import { buildAttendancePdf, sharePdf } from '../../lib/reportPdf';
import { downloadExcel, cellStyles } from '../../lib/excelExport';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { toast } from 'sonner';

const RANGES = [
  { k: 'hoy', label: 'Hoy' },
  { k: 'semana', label: 'Esta semana' },
  { k: 'mes', label: 'Este mes' },
  { k: 'custom', label: 'Personalizado' },
];

export default function AdminReports() {
  const { user } = useAuth();
  const [range, setRange] = useState('hoy');
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [marks, setMarks] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [cfg, setCfg] = useState({ hora_entrada: '08:00', hora_salida: '17:00', tolerancia_minutos: 10 });
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  function rangeFromISO() {
    const t = new Date();
    if (range === 'hoy') return todayISO();
    if (range === 'custom') return customFrom;
    const d = new Date();
    d.setDate(t.getDate() - (range === 'semana' ? 7 : 30));
    return d.toISOString().slice(0, 10);
  }
  function rangeToISO() {
    return range === 'custom' ? customTo : todayISO();
  }

  async function loadAll() {
    setLoading(true);
    const fromISO = rangeFromISO();
    const toISO = rangeToISO();
    // Cargamos un día antes para emparejar turnos nocturnos en el borde del rango.
    const loadFrom = addDaysISO(fromISO, -1);
    const [m, p, c] = await Promise.all([
      supabase.from('marks').select('*, profiles:user_id(nombre,foto_perfil,email,hora_entrada,hora_salida,cedula,cargo)').gte('fecha', loadFrom).lte('fecha', toISO).order('fecha', { ascending: false }).order('created_at'),
      supabase.from('profiles').select('id,nombre,email,foto_perfil,hora_entrada,hora_salida,cedula,cargo').eq('rol', 'personal').eq('activo', true),
      supabase.from('attendance_config').select('*').limit(1).maybeSingle(),
    ]);
    setMarks(m.data || []);
    setPersonal(p.data || []);
    if (c.data) setCfg({
      hora_entrada: c.data.hora_entrada?.slice(0, 5) || '08:00',
      hora_salida: c.data.hora_salida?.slice(0, 5) || '17:00',
      tolerancia_minutos: c.data.tolerancia_minutos ?? 10,
    });
    setLoading(false);
  }
  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [range, customFrom, customTo]);

  // Agrupar marcas por empleado → TURNOS (soporta turnos nocturnos cruzando medianoche)
  const employees = useMemo(() => {
    const fromISO = rangeFromISO();
    const toISO = rangeToISO();
    const today = todayISO();

    const base = {};
    for (const u of personal) base[u.id] = {
      id: u.id, nombre: u.nombre, email: u.email,
      cedula: u.cedula, cargo: u.cargo,
      hora_entrada: u.hora_entrada?.slice?.(0, 5) || cfg.hora_entrada,
      hora_salida: u.hora_salida?.slice?.(0, 5) || cfg.hora_salida,
    };
    const marksByUser = {};
    for (const m of marks) {
      if (!base[m.user_id]) base[m.user_id] = {
        id: m.user_id, nombre: m.profiles?.nombre || '—', email: m.profiles?.email || '—',
        cedula: m.profiles?.cedula, cargo: m.profiles?.cargo,
        hora_entrada: m.profiles?.hora_entrada?.slice?.(0, 5) || cfg.hora_entrada,
        hora_salida: m.profiles?.hora_salida?.slice?.(0, 5) || cfg.hora_salida,
      };
      (marksByUser[m.user_id] ||= []).push(m);
    }
    for (const k in marksByUser) marksByUser[k].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    return Object.values(base).map((u) => {
      const empMarks = marksByUser[u.id] || [];
      const inRange = (d) => d && d >= fromISO && d <= toISO;
      const rowsShift = buildShifts(empMarks)
        .filter((sh) => inRange(sh.entrada?.fecha) || inRange(sh.salida?.fecha))
        .map((sh) => ({
          key: sh.entrada?.id || sh.salida?.id,
          entrada: sh.entrada ? { ...sh.entrada, delay: computeMarkDelay(sh.entrada, cfg) } : null,
          salida: sh.salida || null,
          sortDate: sh.entrada?.fecha || sh.salida?.fecha,
          sortTime: sh.entrada?.hora || sh.salida?.hora || '',
        }));
      // Días hábiles (Lun-Vie, <= hoy) SIN ninguna marca → Ausente
      const datesWithMarks = new Set(empMarks.map((m) => m.fecha));
      for (const d of eachDayISO(fromISO, toISO)) {
        if (d > today || !isWorkingDayPY(d) || datesWithMarks.has(d)) continue;
        rowsShift.push({ key: `aus-${d}`, ausente: true, entrada: null, salida: null, sortDate: d, sortTime: '' });
      }
      const rows = rowsShift.sort((a, b) => {
        if (a.sortDate !== b.sortDate) return a.sortDate < b.sortDate ? 1 : -1;
        return a.sortTime < b.sortTime ? 1 : -1;
      });
      return { ...u, rows };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, personal, cfg, range, customFrom, customTo]);

  function workedFor(e, s) {
    if (!e || !s) return null;
    const a = new Date(e.created_at).getTime();
    const b = new Date(s.created_at).getTime();
    if (b <= a) return null;
    return Math.floor((b - a) / 60000); // minutes
  }

  function exportExcel(scope) {
    const list = scope === 'all' ? employees : employees.filter((e) => e.id === scope);
    if (!list.length || list.every((e) => e.rows.length === 0)) { toast.error('Sin datos para exportar'); return; }

    const sections = list.map((emp) => {
      const totalMin = emp.rows.reduce((acc, d) => acc + (workedFor(d.entrada, d.salida) || 0), 0);
      const totalH = `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
      const rows = emp.rows.map((d) => {
        const e = d.entrada, s = d.salida, wm = workedFor(e, s);
        const ref = e || s;
        const lateLabel = d.ausente ? 'AUSENTE' : e ? (e.delay > 0 ? `+${e.delay}m` : 'A tiempo') : 'Sin marcar';
        return [
          e ? `${e.fecha} ${e.hora?.slice(0, 5)}` : (d.ausente ? d.sortDate : '—'),
          s ? `${s.fecha} ${s.hora?.slice(0, 5)}` : '—',
          wm != null ? `${Math.floor(wm / 60)}h ${wm % 60}m` : '—',
          ref?.direccion_geolocalizada || '—',
          ref?.latitud != null ? `${ref.latitud.toFixed(5)}, ${ref.longitud.toFixed(5)}` : '—',
          lateLabel,
        ];
      });
      const styles = emp.rows.map((d) => {
        const e = d.entrada;
        const lateStyle = d.ausente ? cellStyles.redLight : !e ? cellStyles.redLight : (e.delay > 0 ? cellStyles.redLight : cellStyles.greenLight);
        return [cellStyles.greenLight, cellStyles.blueLight, cellStyles.bold, '', '', lateStyle];
      });
      const ausencias = emp.rows.filter((d) => d.ausente).length;
      return {
        title: `${emp.nombre}${emp.cedula ? ` · CI ${emp.cedula}` : ''} · ${emp.email}  ·  Jornada ${emp.hora_entrada}–${emp.hora_salida}  ·  Total: ${totalH}  ·  Ausencias: ${ausencias}`,
        headerColor: '#D4AF37',
        headers: ['Entrada (fecha y hora)', 'Salida (fecha y hora)', 'Trabajado', 'Ubicación', 'Coords', 'Estado'],
        rows,
        cellStyles: styles,
      };
    });

    downloadExcel({
      filename: `alfatwin-reporte-${range}-${rangeFromISO()}_${rangeToISO()}`,
      title: 'ALFATWIN · Reporte de marcaciones',
      subtitle: `Rango: ${rangeFromISO()} → ${rangeToISO()}  ·  Jornada: ${cfg.hora_entrada} - ${cfg.hora_salida}  ·  Tolerancia: ${cfg.tolerancia_minutos}m`,
      sections,
    });
    toast.success('Excel descargado');
  }

  async function generateAndShare(scope, mode = 'share') {
    setPdfBusy(true);
    try {
      const list = scope === 'all' ? employees : employees.filter((e) => e.id === scope);
      if (!list.length) { toast.error('Sin datos para el reporte'); return; }
      const blob = await buildAttendancePdf({
        title: scope === 'all' ? 'Reporte completo' : `Reporte de ${list[0].nombre}`,
        dateLabel: `Rango: ${RANGES.find((x) => x.k === range)?.label} (${rangeFromISO()} → ${todayISO()})`,
        schedule: { entrada: cfg.hora_entrada, salida: cfg.hora_salida, toleranciaMin: cfg.tolerancia_minutos },
        employees: list,
        includePhotos: true,
      });
      const filename = `alfatwin-reporte-${range}-${todayISO()}.pdf`;

      if (mode === 'download') {
        // Plain download — no share, no mailto.
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        toast.success('PDF descargado');
      } else {
        const subject = `ALFATWIN · ${scope === 'all' ? 'Reporte completo' : list[0].nombre} (${range})`;
        const body = `Adjunto el reporte de marcaciones (${range}).\n\nGenerado: ${new Date().toLocaleString('es-ES')}`;
        const result = await sharePdf(blob, { filename, subject, body, recipients: [] });
        if (result === 'shared') toast.success('Reporte compartido');
        else if (result === 'aborted') toast('Cancelado');
        else toast.success('PDF descargado');
      }

      // Best-effort: limpiar fotos del rango (queda la copia en el PDF)
      if (window.confirm('¿Eliminar las fotos respaldadas del servidor (ya quedan en el PDF)?')) {
        const photos = [];
        for (const u of list) for (const d of u.rows) {
          if (d.entrada?.foto_url) photos.push({ id: d.entrada.id, url: d.entrada.foto_url });
          if (d.salida?.foto_url) photos.push({ id: d.salida.id, url: d.salida.foto_url });
        }
        for (const p of photos) {
          await deleteMarkPhoto(p.url);
          await supabase.from('marks').update({ foto_url: null }).eq('id', p.id);
        }
        if (photos.length) {
          toast.success(`${photos.length} fotos eliminadas del hosting`);
          loadAll();
        }
      }
    } catch (e) {
      toast.error(e.message || 'Error generando PDF');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl" data-testid="admin-reports-page">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="label-eyebrow">Operaciones</p>
          <h1 className="text-3xl font-black tracking-tight">Reportes</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          {RANGES.map((r) => (
            <button
              key={r.k}
              onClick={() => setRange(r.k)}
              data-testid={`reports-range-${r.k}`}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${range === r.k ? 'bg-gold text-obsidian' : 'bg-white/5 text-zinc-400 hover:text-white'}`}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => generateAndShare('all', 'download')}
            disabled={pdfBusy}
            className="btn-ghost flex items-center gap-2"
            data-testid="reports-download-all"
            title="Solo descargar el PDF"
          >
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Descargar PDF
          </button>
          <button
            onClick={() => exportExcel('all')}
            className="btn-ghost flex items-center gap-2"
            data-testid="reports-excel-all"
            title="Descargar reporte completo en Excel"
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={() => generateAndShare('all', 'share')}
            disabled={pdfBusy}
            className="btn-gold flex items-center gap-2"
            data-testid="reports-share-all"
            title="Compartir o enviar por correo desde tu dispositivo"
          >
            {pdfBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Compartir / Enviar
          </button>
        </div>
      </header>

      {range === 'custom' && (
        <div className="card-premium p-4 flex items-end gap-3 flex-wrap" data-testid="reports-custom-range">
          <Calendar className="w-4 h-4 text-gold shrink-0 mb-3" />
          <div className="min-w-[140px]">
            <Label className="label-eyebrow mb-1 block">Desde</Label>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="bg-panel border-white/10 h-10 rounded-xl" data-testid="reports-custom-from" />
          </div>
          <div className="min-w-[140px]">
            <Label className="label-eyebrow mb-1 block">Hasta</Label>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="bg-panel border-white/10 h-10 rounded-xl" data-testid="reports-custom-to" />
          </div>
          <p className="text-xs text-zinc-500 mb-3">Filtra reportes y descargas (PDF/Excel) por fecha personalizada.</p>
        </div>
      )}

      {/* Employees rows */}
      {loading && <div className="py-10 text-center text-zinc-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>}

      {!loading && employees.map((emp) => {
        const totalMin = emp.rows.reduce((acc, d) => acc + (workedFor(d.entrada, d.salida) || 0), 0);
        const totalH = `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
        const ausencias = emp.rows.filter((d) => d.ausente).length;
        return (
          <section key={emp.id} className="card-premium p-5 fade-up" data-testid={`report-emp-${emp.id}`}>
            <header className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <p className="label-eyebrow">Empleado</p>
                <h2 className="text-xl font-black">{emp.nombre}</h2>
                <p className="text-xs text-zinc-500">{emp.email}</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-gold">Total trabajado</p>
                  <p className="text-lg font-black gold-gradient-text">{totalH}</p>
                </div>
                <div className={`rounded-xl border px-3 py-2 text-center ${ausencias > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-white/10 bg-white/5'}`} data-testid={`report-ausencias-${emp.id}`}>
                  <p className={`text-[10px] uppercase tracking-wider ${ausencias > 0 ? 'text-red-400' : 'text-zinc-500'}`}>Ausencias</p>
                  <p className={`text-lg font-black ${ausencias > 0 ? 'text-red-300' : 'text-zinc-400'}`}>{ausencias}</p>
                </div>
                <button
                  onClick={() => generateAndShare(emp.id, 'download')}
                  className="btn-ghost flex items-center gap-2 !text-xs"
                  data-testid={`report-download-${emp.id}`}
                  title="Descargar PDF"
                >
                  <Download className="w-3.5 h-3.5" /> PDF
                </button>
                <button
                  onClick={() => exportExcel(emp.id)}
                  className="btn-ghost flex items-center gap-2 !text-xs"
                  data-testid={`report-excel-${emp.id}`}
                  title="Descargar Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
                <button
                  onClick={() => generateAndShare(emp.id, 'share')}
                  className="btn-ghost flex items-center gap-2 !text-xs"
                  data-testid={`report-share-${emp.id}`}
                  title="Compartir / Enviar"
                >
                  <Send className="w-3.5 h-3.5" /> Enviar
                </button>
              </div>
            </header>

            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left">Entrada · fecha y hora</th>
                    <th className="px-3 py-2 text-left">Salida · fecha y hora</th>
                    <th className="px-3 py-2 text-left">Trabajado</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-left">Ubicación</th>
                    <th className="px-3 py-2 text-center">Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {emp.rows.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-zinc-500 py-6">Sin marcaciones en este rango.</td></tr>
                  )}
                  {emp.rows.map((d) => {
                    const e = d.entrada;
                    const s = d.salida;
                    const wm = workedFor(e, s);
                    const lateLabel = d.ausente ? 'Ausente' : e ? (e.delay > 0 ? `+${minutesToText(e.delay)}` : 'A tiempo') : 'Sin marcar';
                    const lateClass = d.ausente ? 'bg-red-500/15 text-red-300' : !e ? 'bg-zinc-500/15 text-zinc-400' : e.delay > 0 ? 'bg-red-500/15 text-red-300' : 'bg-green-500/15 text-green-300';
                    const ref = e || s;
                    return (
                      <tr key={d.key} className="border-t border-white/5 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {e ? (
                            <><span className="font-bold">{formatDateEs(e.fecha)}</span> <span className="text-green-400 font-mono">{formatTime(e.hora)}</span></>
                          ) : d.ausente ? <span className="font-bold text-zinc-400">{formatDateEs(d.sortDate)}</span> : <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {s ? (
                            <><span className="font-bold">{formatDateEs(s.fecha)}</span> <span className="text-blue-400 font-mono">{formatTime(s.hora)}</span></>
                          ) : <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-3 py-2 font-bold"><span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 text-gold" /> {wm != null ? `${Math.floor(wm / 60)}h ${wm % 60}m` : '—'}</span></td>
                        <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${lateClass}`}>{lateLabel}</span></td>
                        <td className="px-3 py-2 text-xs">
                          {ref?.direccion_geolocalizada ? (
                            <div className="flex items-center gap-1 max-w-[260px]">
                              <span className="truncate text-zinc-300">{ref.direccion_geolocalizada}</span>
                              {ref.latitud != null && (
                                <a href={mapsUrl(ref.latitud, ref.longitud)} target="_blank" rel="noreferrer" className="shrink-0 text-gold hover:text-gold/80" data-testid={`report-map-${ref.id}`}>
                                  <MapPin className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          ) : <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {(e?.foto_url || s?.foto_url) ? (
                            <div className="flex justify-center gap-1">
                              {[e?.foto_url, s?.foto_url].filter(Boolean).map((u, i) => (
                                <a key={i} href={u} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-md overflow-hidden border border-gold/30 hover:border-gold inline-block">
                                  <img src={u} alt="" className="w-full h-full object-cover" />
                                </a>
                              ))}
                            </div>
                          ) : <Camera className="w-3.5 h-3.5 text-zinc-700 inline" />}
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

      {!loading && employees.length === 0 && (
        <div className="card-premium p-10 text-center text-zinc-500">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Sin personal activo todavía.</p>
        </div>
      )}
    </div>
  );
}
