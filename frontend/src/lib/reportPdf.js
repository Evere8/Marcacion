// PDF generation for ALFATWIN attendance reports.
// Uses jsPDF + autotable. Returns a Blob that can be shared via Web Share API
// or attached to a mailto fallback by triggering a download.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function fmtTime(t) { return t ? String(t).slice(0, 5) : '—:—'; }

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

  for (const emp of employees) {
    const blockTitle = `${emp.nombre || '—'} · ${emp.email || ''}`;
    doc.setFillColor(212, 175, 55);
    doc.setTextColor(10);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.rect(30, y, pageW - 60, 22, 'F');
    doc.text(blockTitle, 38, y + 15);
    y += 28;

    const rows = [];
    for (const day of emp.days) {
      const e = day.entrada;
      const s = day.salida;
      const estado = day.ausente ? 'AUSENTE' : (e ? (e.delay > 0 ? `+${e.delay}m` : 'A tiempo') : 'Sin marcar');
      rows.push([
        day.fecha,
        e ? fmtTime(e.hora) : '—',
        s ? fmtTime(s.hora) : '—',
        workedHHMM(e, s),
        (e?.direccion_geolocalizada || s?.direccion_geolocalizada || '—').slice(0, 60),
        e?.latitud != null ? `${e.latitud.toFixed(5)},${e.longitud.toFixed(5)}` : (s?.latitud != null ? `${s.latitud.toFixed(5)},${s.longitud.toFixed(5)}` : '—'),
        (e?.foto_url ? '✔' : '') + (s?.foto_url ? ' / ✔' : ''),
        estado,
      ]);
    }

    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Entrada', 'Salida', 'Trabajado', 'Ubicación', 'Coords', 'Foto', 'Estado']],
      body: rows,
      styles: { fontSize: 8, cellPadding: 4, textColor: 30 },
      headStyles: { fillColor: [25, 25, 25], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 30, right: 30 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 7) {
          const raw = String(data.cell.raw);
          if (raw === 'AUSENTE') { data.cell.styles.textColor = [200, 50, 50]; data.cell.styles.fontStyle = 'bold'; }
          else if (raw.startsWith('+')) data.cell.styles.textColor = [200, 50, 50];
          else if (raw === 'Sin marcar') data.cell.styles.textColor = [120, 120, 120];
          else data.cell.styles.textColor = [40, 130, 60];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 10;

    // Photos block
    if (includePhotos) {
      const allPhotos = [];
      for (const d of emp.days) {
        if (d.entrada?.foto_url) allPhotos.push({ when: `${d.fecha} entrada ${fmtTime(d.entrada.hora)}`, url: d.entrada.foto_url });
        if (d.salida?.foto_url) allPhotos.push({ when: `${d.fecha} salida ${fmtTime(d.salida.hora)}`, url: d.salida.foto_url });
      }
      if (allPhotos.length) {
        if (y > 480) { doc.addPage('landscape'); y = 40; }
        doc.setFontSize(9);
        doc.setTextColor(80);
        doc.text('Fotos adjuntas:', 30, y + 14);
        y += 20;
        const w = 110, h = 80, gap = 10;
        let x = 30;
        for (const p of allPhotos) {
          if (x + w > pageW - 30) { x = 30; y += h + 22; }
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
        y += h + 26;
      }
    }

    if (y > 460) { doc.addPage('landscape'); y = 40; }
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
