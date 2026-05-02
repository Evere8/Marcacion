-- ============================================================
-- 07c_push_unique_fix.sql — Fix definitivo para el error
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
--
-- Causa: la tabla push_subscriptions no tiene el constraint UNIQUE
-- (user_id, endpoint), o el schema cache de PostgREST no está al día.
--
-- Este script:
--   1) Crea la tabla si falta.
--   2) De-duplica por (user_id, endpoint) — deja la fila más reciente.
--   3) Garantiza el UNIQUE (user_id, endpoint).
--   4) Refresca el schema cache de PostgREST.
--
-- Es idempotente — puedes ejecutarlo todas las veces que quieras.
-- ============================================================

-- 1) Tabla
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now()
);

alter table public.push_subscriptions
  add column if not exists user_agent text;

-- 2) De-duplicar por (user_id, endpoint), conservando la fila más reciente.
with ranked as (
  select id,
         row_number() over (partition by user_id, endpoint order by created_at desc) as rn
  from public.push_subscriptions
)
delete from public.push_subscriptions p
using ranked r
where p.id = r.id and r.rn > 1;

-- 3) Constraint UNIQUE (user_id, endpoint) — necesario para upsert/onConflict.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.push_subscriptions'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%user_id, endpoint%'
  ) then
    execute 'alter table public.push_subscriptions
             add constraint push_subscriptions_user_id_endpoint_key
             unique (user_id, endpoint)';
  end if;
end $$;

-- 4) RLS
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own"
  on public.push_subscriptions for update
  using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- 5) Refrescar PostgREST
notify pgrst, 'reload schema';
