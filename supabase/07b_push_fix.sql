-- ============================================================
-- 07b_push_fix.sql — Pequeño parche para el error
-- "Could not find the 'user_agent' column of 'push_subscriptions'
--  in the schema cache"
--
-- Causa: tu tabla `push_subscriptions` no tiene la columna user_agent
-- (versión vieja del SQL) o el schema cache de PostgREST no se refrescó.
--
-- Ejecuta este script una sola vez en Supabase → SQL Editor → Run.
-- Es idempotente, seguro de re-ejecutar.
-- ============================================================

-- 1) Si la tabla no existía aún, créala (versión completa).
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- 2) Si ya existía pero sin user_agent, añádela.
alter table public.push_subscriptions
  add column if not exists user_agent text;

-- 3) RLS por si acaso.
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

-- 4) Forzar a PostgREST a recargar el schema cache (no se necesita si
-- ejecutas el ALTER, pero ayuda si todavía ves el error después).
notify pgrst, 'reload schema';
