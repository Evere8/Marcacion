// Paraguay (America/Asuncion) timezone helpers — UTC-3, no DST.

export function paraguayNow() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Asuncion',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    fecha: `${parts.year}-${parts.month}-${parts.day}`,
    hora: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

export function todayISO() {
  return paraguayNow().fecha;
}

export function paraguayTimeHHMM() {
  return paraguayNow().hora.slice(0, 5);
}

export function formatTime(t) {
  if (!t) return '';
  return t.slice(0, 5);
}

export function formatDateEs(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return dt.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
}

// Format a UTC ISO timestamp into Paraguay local time string.
export function formatPyDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-ES', {
    timeZone: 'America/Asuncion',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function minutesToText(m) {
  if (!m) return 'A tiempo';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
