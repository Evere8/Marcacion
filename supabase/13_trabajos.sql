-- ============================================================
-- 13_trabajos.sql — Tabla simple para el registro diario del chofer.
-- Solo 2 campos visibles (detalle + cantidad), con fecha y hora
-- automáticas. Sin estados (sin "en progreso" / "completada").
-- El admin puede ver y exportar a Excel pero NO editar/borrar.
-- ============================================================

create table if not exists public.trabajos (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  detalle text not null,
  cantidad numeric not null default 0,
  fecha date not null default (now() at time zone 'America/Asuncion')::date,
  hora time not null default (now() at time zone 'America/Asuncion')::time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_trabajos_user_fecha on public.trabajos(user_id, fecha desc);
create index if not exists idx_trabajos_fecha on public.trabajos(fecha desc);

-- Trigger para updated_at
create or replace function public.trabajos_set_updated()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_trabajos_updated on public.trabajos;
create trigger trg_trabajos_updated
  before update on public.trabajos
  for each row execute function public.trabajos_set_updated();

-- Realtime
alter publication supabase_realtime add table public.trabajos;

-- ============================================================
-- RLS: staff ve y edita SOLO los suyos, admin ve TODOS pero no edita.
-- ============================================================
alter table public.trabajos enable row level security;
drop policy if exists trabajos_select_own on public.trabajos;
drop policy if exists trabajos_select_admin on public.trabajos;
drop policy if exists trabajos_insert_own on public.trabajos;
drop policy if exists trabajos_update_own on public.trabajos;
drop policy if exists trabajos_delete_own on public.trabajos;

create policy trabajos_select_own on public.trabajos
  for select using ( user_id = auth.uid() or public.is_admin() );

create policy trabajos_insert_own on public.trabajos
  for insert with check ( user_id = auth.uid() );

create policy trabajos_update_own on public.trabajos
  for update using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

create policy trabajos_delete_own on public.trabajos
  for delete using ( user_id = auth.uid() );

notify pgrst, 'reload schema';
