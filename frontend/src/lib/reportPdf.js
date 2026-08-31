// PDF generation for ALFATWIN attendance reports.
// Uses jsPDF + autotable. Returns a Blob that can be shared via Web Share API
// or attached to a mailto fallback by triggering a download.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { mapsUrl } from './gps';

function fmtTime(t) { return t ? String(t).slice(0, 5) : '—:—'; }

// Mejor ubicación del turno: dirección si existe, si no coordenadas GPS.
function locOf(e, s) {
  const marks = [e, s].filter(Boolean);
  const withAddr = marks.find((m) => m.direccion_geolocalizada && String(m.direccion_geolocalizada).trim());
  const withCoords = marks.find((m) => m.latitud != null && m.longitud != null);
  if (withAddr) return { text: withAddr.direccion_geolocalizada, lat: withAddr.latitud, lng: withAddr.longitud };
  if (withCoords) return { text: `${Number(withCoords.latitud).toFixed(5)}, ${Number(withCoords.longitud).toFixed(5)}`, lat: withCoords.latitud, lng: withCoords.longitud };
  return null;
}

function workedHHMM(entradaMark, salidaMark) {
  if (!entradaMark || !salidaMark) return '—';
  const a = new Date(entradaMark.created_at).getTime();
  const b = new Date(salidaMark.created_at).getTime();
  if (b <= a) return '—';
  const totalMin = Math.floor((b - a) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

async function fetchDataUrl(url) {
  try {
    const r = await fetch(url, { mode: 'cors' });
    const blob = await r.blob();
    return await new Promise((res) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * @param {Object} opts
 *   title, dateLabel, schedule {entrada,salida,toleranciaMin}
 *   employees: [{ id, nombre, email, marks: [marksByDay...] }]
 *   includePhotos: boolean
 */
export async function buildAttendancePdf({ title, dateLabel, schedule, employees, includePhotos = true }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, pageW, 60, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ALFATWIN', 30, 30);
  doc.setFontSize(11);
  doc.setTextColor(255);
  doc.text(title || 'Reporte de marcaciones', 30, 48);
  doc.setFontSize(9);
  doc.setTextColor(180);
  doc.text(dateLabel || '', pageW - 30, 30, { align: 'right' });
  if (schedule) {
    doc.text(
      `Jornada: ${schedule.entrada} - ${schedule.salida}  ·  Tolerancia ${schedule.toleranciaMin}m`,
      pageW - 30, 48, { align: 'right' },
    );
  }

  let y = 80;

  // Tabla ÚNICA y continua: todo el personal junto, con columna Nombre.
  // Sin bloque/título dorado por persona → reporte más compacto y rápido de leer.
  const sorted = [...employees].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  const rows = [];
  const locUrls = [];
  const photoList = [];
  for (const emp of sorted) {
    for (const day of emp.rows) {
      const e = day.entrada;
      const s = day.salida;
      const loc = locOf(e, s);
      locUrls.push(loc?.lat != null ? mapsUrl(loc.lat, loc.lng) : null);
      const estado = day.ausente ? 'AUSENTE' : (e ? (e.delay > 0 ? `+${e.delay}m` : 'A tiempo') : 'Sin marcar');
      rows.push([
        emp.nombre || '—',
        e ? `${e.fecha} ${fmtTime(e.hora)}` : (day.ausente ? day.sortDate : '—'),
        s ? `${s.fecha} ${fmtTime(s.hora)}` : '—',
        workedHHMM(e, s),
        loc?.text || '—',
        estado,
      ]);
      if (includePhotos) {
        if (e?.foto_url) photoList.push({ when: `${emp.nombre} · ${e.fecha} entrada ${fmtTime(e.hora)}`, url: e.foto_url });
        if (s?.foto_url) photoList.push({ when: `${emp.nombre} · ${s.fecha} salida ${fmtTime(s.hora)}`, url: s.foto_url });
      }
    }
  }

  autoTable(doc, {
    startY: y,
    head: [['Nombre', 'Entrada', 'Salida', 'Trabajado', 'Ubicación', 'Estado']],
    body: rows,
    styles: { fontSize: 8, cellPadding: 4, textColor: 30 },
    headStyles: { fillColor: [212, 175, 55], textColor: 10, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: { 0: { fontStyle: 'bold', textColor: [10, 10, 10] } },
    margin: { left: 30, right: 30 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4 && locUrls[data.row.index]) {
        data.cell.styles.textColor = [30, 64, 175];
      }
      if (data.section === 'body' && data.column.index === 5) {
        const raw = String(data.cell.raw);
        if (raw === 'AUSENTE') { data.cell.styles.textColor = [200, 50, 50]; data.cell.styles.fontStyle = 'bold'; }
        else if (raw.startsWith('+')) data.cell.styles.textColor = [200, 50, 50];
        else if (raw === 'Sin marcar') data.cell.styles.textColor = [120, 120, 120];
        else data.cell.styles.textColor = [40, 130, 60];
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const url = locUrls[data.row.index];
        if (url) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
      }
    },
  });
  y = doc.lastAutoTable.finalY + 16;

  // Fotos de marcación (todas, etiquetadas con el nombre) al final del reporte.
  if (includePhotos && photoList.length) {
    if (y > 480) { doc.addPage('landscape'); y = 40; }
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text('Fotos de marcación:', 30, y + 14);
    y += 22;
    const w = 110, h = 80, gap = 10;
    let x = 30;
    for (const p of photoList) {
      if (x + w > pageW - 30) { x = 30; y += h + 24; }
      if (y + h > doc.internal.pageSize.getHeight() - 40) { doc.addPage('landscape'); y = 40; x = 30; }
      const dataUrl = await fetchDataUrl(p.url);
      if (dataUrl) {
        try { doc.addImage(dataUrl, 'WEBP', x, y, w, h, undefined, 'FAST'); } catch {
          try { doc.addImage(dataUrl, 'JPEG', x, y, w, h, undefined, 'FAST'); } catch {}
        }
        doc.setFontSize(7);
        doc.setTextColor(80);
        doc.text(p.when, x, y + h + 10, { maxWidth: w });
      }
      x += w + gap;
    }
  }

  return doc.output('blob');
}

/**
 * Try to share PDF via Web Share API (mobile picks Mail, WhatsApp, etc).
 * Falls back to opening mailto: with download instruction on desktop.
 */
export async function sharePdf(blob, { filename, subject, body, recipients = [] }) {
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: subject, text: body });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'aborted';
      // Fall through to mailto fallback
    }
  }
  // Desktop fallback: download the PDF and open mailto with body
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  const to = recipients.join(',');
  const mailto = `mailto:${to}?subject=${encodeURIComponent(subject || filename)}&body=${encodeURIComponent((body || '') + '\n\nAdjunta el PDF descargado: ' + filename)}`;
  window.location.href = mailto;
  return 'downloaded_mailto';
}
