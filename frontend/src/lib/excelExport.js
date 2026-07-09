// Helper para exportar a Excel (.xls) usando HTML con estilos.
// Excel/LibreOffice abren este formato perfectamente y respetan
// colores, bordes y negritas — sin necesidad de librerías externas.
//
// Uso: downloadExcel({ filename, title, subtitle, sections })
//   sections: [{ title, headerColor, headers: [...], rows: [[...]], cellStyles?: [[...]] }]

const PALETTE = {
  gold: '#D4AF37',
  dark: '#0b0b0b',
  white: '#ffffff',
  redLight: '#FEE2E2',
  redDark: '#991B1B',
  greenLight: '#DCFCE7',
  greenDark: '#166534',
  blueLight: '#DBEAFE',
  blueDark: '#1E3A8A',
  zinc: '#71717A',
};

function esc(v) {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildHtml({ title, subtitle, sections }) {
  const sectionsHtml = sections.map((sec) => {
    const headerColor = sec.headerColor || PALETTE.gold;
    const headers = sec.headers
      .map(
        (h) =>
          `<th style="background:${PALETTE.dark};color:${PALETTE.white};padding:8px 10px;border:1px solid #333;text-align:left;font-family:Arial;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">${esc(h)}</th>`
      )
      .join('');
    const rowsHtml = sec.rows
      .map((row, ri) => {
        const cells = row
          .map((cell, ci) => {
            const style = sec.cellStyles?.[ri]?.[ci] || '';
            let content;
            if (cell && typeof cell === 'object' && cell.link) {
              content = `<a href="${esc(cell.link)}" style="color:#1E40AF;text-decoration:underline;">${esc(cell.text ?? '')}</a>`;
            } else {
              content = esc(cell);
            }
            return `<td style="padding:7px 10px;border:1px solid #ddd;font-family:Arial;font-size:11px;${style}">${content}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
    return `
      <tr><td colspan="${sec.headers.length}" style="background:${headerColor};color:${PALETTE.dark};padding:10px 12px;font-family:Arial;font-size:13px;font-weight:bold;border:1px solid #333;">${esc(sec.title)}</td></tr>
      <tr>${headers}</tr>
      ${rowsHtml || `<tr><td colspan="${sec.headers.length}" style="padding:10px;font-family:Arial;font-size:11px;color:${PALETTE.zinc};">Sin datos.</td></tr>`}
      <tr><td colspan="${sec.headers.length}" style="padding:4px;border:none;"></td></tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${esc(title)}</title>
</head>
<body>
<table style="border-collapse:collapse;width:100%;">
  <tr><td colspan="20" style="background:${PALETTE.dark};color:${PALETTE.gold};padding:14px 12px;font-family:Arial;font-size:18px;font-weight:bold;letter-spacing:.5px;">${esc(title)}</td></tr>
  ${subtitle ? `<tr><td colspan="20" style="background:#1a1a1a;color:#fff;padding:8px 12px;font-family:Arial;font-size:11px;">${esc(subtitle)}</td></tr>` : ''}
  <tr><td colspan="20" style="padding:6px;"></td></tr>
  ${sectionsHtml}
</table>
</body>
</html>`;
}

export function downloadExcel({ filename, title, subtitle, sections }) {
  const html = buildHtml({ title, subtitle, sections });
  // Excel detecta application/vnd.ms-excel + extensión .xls
  const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// Estilos pre-armados para celdas (úsalos en cellStyles[r][c])
export const cellStyles = {
  redLight: `background:${PALETTE.redLight};color:${PALETTE.redDark};font-weight:bold;`,
  greenLight: `background:${PALETTE.greenLight};color:${PALETTE.greenDark};font-weight:bold;`,
  blueLight: `background:${PALETTE.blueLight};color:${PALETTE.blueDark};font-weight:bold;`,
  bold: `font-weight:bold;`,
  mono: `font-family:'Courier New',monospace;`,
  goldRow: `background:#FFF7E0;`,
};

export { PALETTE };
