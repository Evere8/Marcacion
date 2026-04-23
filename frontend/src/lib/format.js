export function formatTime(t) {
  if (!t) return '';
  return t.slice(0, 5);
}
export function formatDateEs(d) {
  if (!d) return '';
  const dt = typeof d === 'string' ? new Date(d + 'T00:00:00') : d;
  return dt.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
}
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
export function minutesToText(m) {
  if (!m) return 'A tiempo';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
