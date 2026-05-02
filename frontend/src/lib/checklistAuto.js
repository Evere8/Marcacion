// Shared helpers for the daily checklist (used by admin + staff).
//
// `autoGenerateRepeatablesByHour` — given the current list of items for a user,
// regenerates today's copy of each repetible item *whose hora has already
// passed in Paraguay time* (or whose hora is null). This way:
//   • A pendiente set at 08:00 only re-appears for today after 08:00 PY.
//   • A pendiente without hora re-appears as soon as the user opens the app.
//
// The generation is idempotent: it relies on (titulo, fecha) uniqueness
// per user — the autoGenerate routine only inserts what's missing.

import { supabase } from './supabase';
import { todayISO, paraguayTimeHHMM } from './format';

function hhmmToMin(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export async function autoGenerateRepeatablesByHour(userId, current) {
  if (!userId || !Array.isArray(current)) return [];
  const today = todayISO();
  const nowMin = hhmmToMin(paraguayTimeHHMM());

  // Pick the most-recent definition per repetible titulo
  // so we always carry forward the latest hora the user set.
  const byTitulo = new Map();
  for (const it of current) {
    if (!it.repetible) continue;
    const prev = byTitulo.get(it.titulo);
    if (!prev || new Date(it.created_at) > new Date(prev.created_at)) {
      byTitulo.set(it.titulo, it);
    }
  }

  const todayTitles = new Set(
    current.filter((i) => i.fecha === today).map((i) => i.titulo),
  );

  const toInsert = [];
  for (const [titulo, def] of byTitulo) {
    if (todayTitles.has(titulo)) continue;
    const horaMin = hhmmToMin(def.hora);
    // If hora is set, only generate after that hora passes today.
    if (horaMin != null && nowMin != null && nowMin < horaMin) continue;
    toInsert.push({
      user_id: userId,
      titulo,
      repetible: true,
      hora: def.hora || null,
      fecha: today,
    });
  }

  if (!toInsert.length) return [];
  const { data, error } = await supabase.from('checklists').insert(toInsert).select();
  if (error) {
    console.warn('[checklist] autoGenerate failed:', error);
    return [];
  }
  return data || [];
}
