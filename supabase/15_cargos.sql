-- ============================================================
-- 15_cargos.sql — Catálogo editable de cargos (chofer, admin, depósito…)
-- Cada cargo tiene un flag `con_cronometro` que indica si los trabajos
-- de ese cargo muestran botón Iniciar/Finalizar en el Home.
-- ============================================================

create table if not exists public.cargos (
  id uuid primary key default uuid_generate_v4(),
  nombre text not null unique,
  con_cronometro boolean not null default false,
  orden int not null default 100,
  created_at timestamptz not null default now()
);

alter table public.cargos enable row level security;
drop policy if exists cargos_select on public.cargos;
drop policy if exists cargos_admin on public.cargos;
create policy cargos_select on public.cargos
  for select using (auth.uid() is not null);
create policy cargos_admin on public.cargos
  for all using (public.is_admin()) with check (public.is_admin());

-- Quitar el CHECK estricto del cargo en profiles (si existe en 14) para
-- permitir cualquier nombre del catálogo.
do $$
declare cname text;
begin
  select conname into cname from pg_constraint
   where conrelid = 'public.profiles'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%cargo%in%';
  if cname is not null then
    execute format('alter table public.profiles drop constraint %I', cname);
  end if;
end $$;

-- Seed por defecto (idempotente)
insert into public.cargos (nombre, con_cronometro, orden) values
  ('chofer', true, 10),
  ('administracion', false, 20),
  ('deposito', false, 30)
on conflict (nombre) do nothing;

-- Realtime
alter publication supabase_realtime add table public.cargos;

notify pgrst, 'reload schema';
