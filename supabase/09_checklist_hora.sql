-- ============================================================
-- 09_checklist_hora.sql — añade columna `hora` a checklists para
-- que cada pendiente repetible pueda tener su propia hora del día.
--
-- Idempotente: ejecuta cuantas veces quieras en Supabase SQL Editor.
-- ============================================================

alter table public.checklists
  add column if not exists hora time;

create index if not exists idx_checklists_hora
  on public.checklists (user_id, fecha, hora);

-- Refrescar cache PostgREST para que el frontend vea la columna.
notify pgrst, 'reload schema';
