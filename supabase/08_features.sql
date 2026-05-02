-- ============================================================
-- 08_features.sql — Cronómetro, fotos en marcaciones, recipients
-- Run AFTER 01-07 in Supabase SQL Editor. Idempotent.
-- ============================================================

-- 1) Storage bucket for mark photos
insert into storage.buckets (id, name, public)
values ('mark-photos','mark-photos', true)
on conflict (id) do nothing;

drop policy if exists "mark_photos_public_read" on storage.objects;
create policy "mark_photos_public_read"
  on storage.objects for select
  using ( bucket_id = 'mark-photos' );

drop policy if exists "mark_photos_auth_write" on storage.objects;
create policy "mark_photos_auth_write"
  on storage.objects for insert
  with check ( bucket_id = 'mark-photos' and auth.role() = 'authenticated' );

drop policy if exists "mark_photos_auth_update" on storage.objects;
create policy "mark_photos_auth_update"
  on storage.objects for update
  using ( bucket_id = 'mark-photos' and auth.role() = 'authenticated' );

drop policy if exists "mark_photos_auth_delete" on storage.objects;
create policy "mark_photos_auth_delete"
  on storage.objects for delete
  using ( bucket_id = 'mark-photos' and auth.role() = 'authenticated' );

-- 2) Add foto_url to marks table
alter table public.marks
  add column if not exists foto_url text;

-- 3) Report recipients (max 3 emails kept by admin)
create table if not exists public.report_recipients (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  nombre      text,
  created_at  timestamptz not null default now(),
  unique (email)
);

alter table public.report_recipients enable row level security;

drop policy if exists "report_recipients_admin_all" on public.report_recipients;
create policy "report_recipients_admin_all"
  on public.report_recipients for all
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- Reload schema cache
notify pgrst, 'reload schema';
