-- ============================================================
-- ALFATWIN  -- 05_live_positions.sql  (run ONCE in SQL Editor)
-- Live realtime position per employee while their app is active.
-- ============================================================

create table if not exists public.live_positions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  latitud double precision not null,
  longitud double precision not null,
  precision_m double precision,
  heading double precision,
  speed double precision,
  updated_at timestamptz not null default now()
);

create index if not exists idx_live_positions_updated on public.live_positions(updated_at desc);

alter table public.live_positions enable row level security;
drop policy if exists livepos_own on public.live_positions;
drop policy if exists livepos_admin on public.live_positions;

create policy livepos_own on public.live_positions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy livepos_admin on public.live_positions
  for select using (public.is_admin());

alter publication supabase_realtime add table public.live_positions;
