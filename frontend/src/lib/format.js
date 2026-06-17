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

/**
 * Compute mark delay in minutes. Prefers per-employee schedule from
 * mark.profiles (hora_entrada/hora_salida) if present, otherwise falls
 * back to the provided global cfg.
 */
export function computeMarkDelay(mark, cfg) {
  if (!mark) return 0;
  // Per-employee schedule wins
  const empEntrada = mark.profiles?.hora_entrada;
  const empSalida = mark.profiles?.hora_salida;
  const effective = {
    hora_entrada: empEntrada || cfg?.hora_entrada,
    hora_salida: empSalida || cfg?.hora_salida,
    tolerancia_minutos: cfg?.tolerancia_minutos ?? 0,
  };
  const targetHHMM = mark.tipo === 'entrada' ? effective.hora_entrada : effective.hora_salida;
  if (!targetHHMM || !mark.hora) return mark.retraso_minutos || 0;
  const [th, tm] = String(targetHHMM).slice(0, 5).split(':').map(Number);
  const [mh, mm] = String(mark.hora).slice(0, 5).split(':').map(Number);
  const delta = (mh * 60 + mm) - (th * 60 + tm);
  if (mark.tipo === 'entrada') {
    const tol = Number(effective.tolerancia_minutos ?? 0);
    return delta > tol ? delta : 0;
  }
  // salida — late only if after the scheduled exit hour
  return delta > 0 ? delta : 0;
}

/**
 * Get effective schedule for a profile (with global fallback).
 */
export function effectiveSchedule(profile, cfg) {
  return {
    hora_entrada: profile?.hora_entrada?.slice?.(0, 5) || cfg?.hora_entrada || '08:00',
    hora_salida: profile?.hora_salida?.slice?.(0, 5) || cfg?.hora_salida || '17:00',
    tolerancia_minutos: cfg?.tolerancia_minutos ?? 10,
  };
}
