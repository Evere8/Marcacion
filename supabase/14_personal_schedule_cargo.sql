-- ============================================================
-- 14_personal_schedule_cargo.sql
-- Agrega a profiles: cedula, hora_entrada, hora_salida, cargo
-- Agrega a trabajos: iniciado_en, finalizado_en, duracion_segundos
-- ============================================================

alter table public.profiles
  add column if not exists cedula text,
  add column if not exists hora_entrada time,
  add column if not exists hora_salida time,
  add column if not exists cargo text check (cargo in ('chofer','administracion'));

create index if not exists idx_profiles_cargo on public.profiles(cargo);

alter table public.trabajos
  add column if not exists iniciado_en timestamptz,
  add column if not exists finalizado_en timestamptz,
  add column if not exists duracion_segundos int;

-- Trigger: cuando se setea finalizado_en, calcular duracion_segundos si no viene.
create or replace function public.trabajos_calc_duracion()
returns trigger language plpgsql as $$
begin
  if new.finalizado_en is not null and new.iniciado_en is not null then
    new.duracion_segundos := greatest(0, extract(epoch from (new.finalizado_en - new.iniciado_en))::int);
  end if;
  return new;
end; $$;

drop trigger if exists trg_trabajos_duracion on public.trabajos;
create trigger trg_trabajos_duracion
  before insert or update on public.trabajos
  for each row execute function public.trabajos_calc_duracion();

notify pgrst, 'reload schema';
