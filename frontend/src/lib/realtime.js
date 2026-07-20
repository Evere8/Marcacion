// Helpers para actualizar el estado de forma GRANULAR con los payloads de
// Supabase Realtime, en lugar de re-descargar toda la tabla por cada evento.

// Aplica un cambio (INSERT/UPDATE/DELETE) de postgres_changes a un array-state.
// - getId: cómo obtener el id de una fila (por defecto r.id)
// - belongs: si el registro pertenece al filtro actual (fecha/rango). Si un
//   UPDATE saca al registro del filtro, se elimina del estado.
// - prepend: dónde insertar los nuevos (por defecto al inicio).
export function applyRealtimeChange(setList, payload, opts = {}) {
  const getId = opts.getId || ((r) => r?.id);
  const belongs = opts.belongs || (() => true);
  const prepend = opts.prepend !== false;
  const { eventType } = payload;
  const rec = payload.new;
  const old = payload.old;
  setList((prev) => {
    if (eventType === 'DELETE') {
      const id = getId(old);
      return prev.filter((r) => getId(r) !== id);
    }
    if (rec && !belongs(rec)) {
      return prev.filter((r) => getId(r) !== getId(rec));
    }
    const idx = prev.findIndex((r) => getId(r) === getId(rec));
    if (idx >= 0) {
      const cp = prev.slice();
      cp[idx] = { ...cp[idx], ...rec };
      return cp;
    }
    return prepend ? [rec, ...prev] : [...prev, rec];
  });
}

// Debounce simple: agrupa múltiples llamadas en una sola tras `ms`.
export function createDebouncer(fn, ms = 3000) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}
