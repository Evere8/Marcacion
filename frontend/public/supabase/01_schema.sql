-- ============================================================
-- ALFATWIN - Sistema de Marcación de Personal
-- 01_schema.sql  (run FIRST in Supabase SQL Editor)
-- ============================================================

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- profiles (linked 1:1 with auth.users)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  nombre text not null,
  edad int,
  telefono text,
  direccion text,
  foto_perfil text,
  rol text not null default 'personal' check (rol in ('admin','personal')),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_profiles_rol on public.profiles(rol);
create index if not exists idx_profiles_activo on public.profiles(activo);

-- ------------------------------------------------------------
-- attendance_config (single row)
-- ------------------------------------------------------------
create table if not exists public.attendance_config (
  id uuid primary key default uuid_generate_v4(),
  hora_entrada time not null default '08:00',
  hora_salida time not null default '17:00',
  tolerancia_minutos int not null default 10,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- system_config (single row)
-- ------------------------------------------------------------
create table if not exists public.system_config (
  id uuid primary key default uuid_generate_v4(),
  nombre_sistema text not null default 'ALFATWIN',
  logo text,
  color_primary text not null default '#D4AF37',
  color_secondary text not null default '#E2E8F0',
  tagline text default 'Conectamos Talento · Generamos Soluciones',
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- marks (clock-in / clock-out)
-- ------------------------------------------------------------
create table if not exists public.marks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','salida')),
  fecha date not null default current_date,
  hora time not null default current_time,
  latitud double precision,
  longitud double precision,
  precision_m double precision,
  direccion_geolocalizada text,
  dispositivo_info text,
  fake_gps_detected boolean not null default false,
  retraso_minutos int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_marks_user_fecha on public.marks(user_id, fecha desc);
create index if not exists idx_marks_fecha on public.marks(fecha desc);
create index if not exists idx_marks_created on public.marks(created_at desc);

-- ------------------------------------------------------------
-- tasks
-- ------------------------------------------------------------
create table if not exists public.tasks (
  id uuid primary key default uuid_generate_v4(),
  titulo text not null,
  descripcion text,
  urgencia text not null default 'verde' check (urgencia in ('verde','amarillo','rojo')),
  admin_id uuid references public.profiles(id) on delete set null,
  assignee_id uuid references public.profiles(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_progreso','completada')),
  fecha_limite date,
  created_at timestamptz not null default now()
);
create index if not exists idx_tasks_assignee on public.tasks(assignee_id);
create index if not exists idx_tasks_urgencia on public.tasks(urgencia);

-- ------------------------------------------------------------
-- task_chat
-- ------------------------------------------------------------
create table if not exists public.task_chat (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  visto boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_chat_task on public.task_chat(task_id, created_at);

-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('tarea','marcacion','alerta','sistema','chat')),
  titulo text not null,
  mensaje text not null,
  link text,
  leido boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifs_user_leido on public.notifications(user_id, leido, created_at desc);

-- ------------------------------------------------------------
-- checklists (personal pendientes)
-- ------------------------------------------------------------
create table if not exists public.checklists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  completado boolean not null default false,
  repetible boolean not null default false,
  fecha date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists idx_checklists_user on public.checklists(user_id, fecha desc);

-- ------------------------------------------------------------
-- Trigger: calculate retraso_minutos on mark insert
-- ------------------------------------------------------------
create or replace function public.calc_retraso()
returns trigger language plpgsql as $$
declare
  cfg record;
  entrada_ts timestamp;
  salida_ts timestamp;
  mark_ts timestamp;
  diff int;
begin
  select hora_entrada, hora_salida, tolerancia_minutos into cfg from public.attendance_config limit 1;
  if cfg is null then
    return new;
  end if;

  mark_ts := (new.fecha::text || ' ' || new.hora::text)::timestamp;

  if new.tipo = 'entrada' then
    entrada_ts := (new.fecha::text || ' ' || cfg.hora_entrada::text)::timestamp;
    diff := extract(epoch from (mark_ts - entrada_ts))/60;
    if diff > cfg.tolerancia_minutos then
      new.retraso_minutos := diff;
    else
      new.retraso_minutos := 0;
    end if;
  else
    salida_ts := (new.fecha::text || ' ' || cfg.hora_salida::text)::timestamp;
    diff := extract(epoch from (mark_ts - salida_ts))/60;
    new.retraso_minutos := greatest(diff, 0);
  end if;

  return new;
end; $$;

drop trigger if exists trg_marks_retraso on public.marks;
create trigger trg_marks_retraso
before insert or update on public.marks
for each row execute function public.calc_retraso();

-- ------------------------------------------------------------
-- Trigger: auto-create profile when new auth user signs up
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, nombre, rol)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'rol', 'personal')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Realtime publication
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.marks;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.task_chat;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.checklists;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.system_config;
