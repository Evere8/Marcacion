// Verifica la lógica de turnos nocturnos (buildShifts + derivación de nextAction)
import { buildShifts } from '../src/lib/format.js';

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } }

const M = (tipo, fecha, hora) => ({ tipo, fecha, hora, created_at: `${fecha}T${hora}Z` });

// Deriva nextAction igual que Home.jsx
function derive(marksAsc, today) {
  const shifts = buildShifts(marksAsc);
  const currentShift = shifts[shifts.length - 1] || null;
  const openShift = currentShift && currentShift.entrada && !currentShift.salida ? currentShift : null;
  const lastClosed = [...shifts].reverse().find((s) => s.entrada && s.salida) || null;
  const jornadaCompletaHoy = !openShift && !!lastClosed && lastClosed.entrada?.fecha === today;
  return openShift ? 'salida' : jornadaCompletaHoy ? null : 'entrada';
}

// 1) Turno nocturno ABIERTO cruzando medianoche: entrada ayer 21:30, hoy sin salida.
//    (Home carga ayer+hoy). Antes del fix mostraba "entrada"; ahora debe pedir SALIDA.
ok('nocturno abierto -> salida', derive([M('salida','2026-06-30','05:00:00'), M('entrada','2026-06-30','21:30:00')], '2026-07-01') === 'salida');

// 2) Tras marcar salida al día siguiente -> puede iniciar nuevo turno (entrada).
ok('nocturno cerrado dia previo -> entrada', derive([M('entrada','2026-06-30','21:30:00'), M('salida','2026-07-01','05:00:00')], '2026-07-01') === 'entrada');

// 3) Turno diurno completo hoy -> jornada completa (null).
ok('diurno completo hoy -> null', derive([M('entrada','2026-07-01','08:00:00'), M('salida','2026-07-01','17:00:00')], '2026-07-01') === null);

// 4) Sin marcas -> entrada.
ok('sin marcas -> entrada', derive([], '2026-07-01') === 'entrada');

// 5) Emparejamiento de reportes: entrada 06-29 + salida 06-30 = 1 turno con 2 fechas.
const shifts = buildShifts([M('entrada','2026-06-29','21:30:00'), M('salida','2026-06-30','05:00:00'), M('entrada','2026-06-30','21:30:00')]);
ok('reporte: 2 turnos', shifts.length === 2);
ok('reporte: turno1 entrada 06-29 / salida 06-30 (2 fechas)', shifts[0].entrada?.fecha === '2026-06-29' && shifts[0].salida?.fecha === '2026-06-30');
ok('reporte: turno2 abierto (salida null)', shifts[1].entrada?.fecha === '2026-06-30' && shifts[1].salida === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
