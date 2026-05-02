import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2, FileText, Send, Download, MapPin, Camera, Clock } from 'lucide-react';
import { formatTime, formatDateEs, todayISO, computeMarkDelay, minutesToText } from '../../lib/format';
import { mapsUrl } from '../../lib/gps';
import { deleteMarkPhoto } from '../../lib/upload';
import { buildAttendancePdf, sharePdf } from '../../lib/reportPdf';
import { toast } from 'sonner';

const RANGES = [
  { k: 'hoy', label: 'Hoy' },
  { k: 'semana', label: 'Esta semana' },
  { k: 'mes', label: 'Este mes' },
];

export default function AdminReports() {
  const { user } = useAuth();
  const [range, setRange] = useState('hoy');
  const [marks, setMarks] = useState([]);
  const [personal, setPersonal] = useState([]);
  const [cfg, setCfg] = useState({ hora_entrada: '08:00', hora_salida: '17:00', tolerancia_minutos: 10 });
  const [loading, setLoading] = useState(true);
  const [pdfBusy, setPdfBusy] = useState(false);

  function rangeFromISO() {
    const t = new Date();
    if (range === 'hoy') return todayISO();
    const d = new Date();
    d.setDate(t.getDate() - (range === 'semana' ? 7 : 30));
    return d.toISOString().slice(0, 10);
  }

  async function loadAll() {
    setLoading(true);
    const fromISO = rangeFromISO();
    const [m, p, c] = await Promise.all([
      supabase.from('marks').select('*, profiles:user_id(nombre,foto_perfil,email)').gte('fecha', fromISO).order('fecha', { ascending: false }).order('created_at'),
      supabase.from('profiles').select('id,nombre,email,foto_perfil').eq('rol', 'personal').eq('activo', true),
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
  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [range]);

  // Group marks by employee → day with entrada/salida + computed delay
  const employees = useMemo(() => {
    const byUser = {};
    for (const u of personal) byUser[u.id] = { id: u.id, nombre: u.nombre, email: u.email, days: {} };
    for (const m of marks) {
      const key = m.user_id;
      if (!byUser[key]) byUser[key] = { id: key, nombre: m.profiles?.nombre || '—', email: m.profiles?.email || '—', days: {} };
      const day = (byUser[key].days[m.fecha] ||= { fecha: m.fecha });
      const enriched = { ...m, delay: computeMarkDelay(m, cfg) };
      if (m.tipo === 'entrada') { if (!day.entrada) day.entrada = enriched; }
      else day.salida = enriched;
    }
    return Object.values(byUser).map((u) => ({
      ...u,
      days: Object.values(u.days).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    }));
  }, [marks, personal, cfg]);

  function workedFor(e, s) {
    if (!e || !s) return null;
    const a = new Date(e.created_at).getTime();
    const b = new Date(s.created_at).getTime();
    if (b <= a) return null;
    return Math.floor((b - a) / 60000); // minutes
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
        for (const u of list) for (const d of u.days) {
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

      {/* Employees rows */}
      {loading && <div className="py-10 text-center text-zinc-500"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>}

      {!loading && employees.map((emp) => {
        const totalMin = emp.days.reduce((acc, d) => acc + (workedFor(d.entrada, d.salida) || 0), 0);
        const totalH = `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
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
                <button
                  onClick={() => generateAndShare(emp.id, 'download')}
                  className="btn-ghost flex items-center gap-2 !text-xs"
                  data-testid={`report-download-${emp.id}`}
                  title="Descargar PDF"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar
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
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Entrada</th>
                    <th className="px-3 py-2 text-left">Salida</th>
                    <th className="px-3 py-2 text-left">Trabajado</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-left">Ubicación</th>
                    <th className="px-3 py-2 text-center">Foto</th>
                  </tr>
                </thead>
                <tbody>
                  {emp.days.length === 0 && (
                    <tr><td colSpan={7} className="text-center text-zinc-500 py-6">Sin marcaciones en este rango.</td></tr>
                  )}
                  {emp.days.map((d) => {
                    const e = d.entrada;
                    const s = d.salida;
                    const wm = workedFor(e, s);
                    const lateLabel = e ? (e.delay > 0 ? `+${minutesToText(e.delay)}` : 'A tiempo') : 'Sin marcar';
                    const lateClass = !e ? 'bg-zinc-500/15 text-zinc-400' : e.delay > 0 ? 'bg-red-500/15 text-red-300' : 'bg-green-500/15 text-green-300';
                    const ref = e || s;
                    return (
                      <tr key={d.fecha} className="border-t border-white/5 hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-bold whitespace-nowrap">{formatDateEs(d.fecha)}</td>
                        <td className="px-3 py-2 text-green-400 font-mono">{e ? formatTime(e.hora) : '—'}</td>
                        <td className="px-3 py-2 text-blue-400 font-mono">{s ? formatTime(s.hora) : '—'}</td>
                        <td className="px-3 py-2 font-bold flex items-center gap-1"><Clock className="w-3 h-3 text-gold" /> {wm != null ? `${Math.floor(wm / 60)}h ${wm % 60}m` : '—'}</td>
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
