-- ============================================================
-- ALFATWIN  -- 03_storage.sql  (run THIRD)
-- Storage buckets + policies
-- ============================================================

-- Create buckets (public so avatars/logos load without signed URLs).
insert into storage.buckets (id, name, public)
values ('avatars','avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('system','system', true)
on conflict (id) do nothing;

-- Read is public for both buckets.
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
  on storage.objects for select
  using ( bucket_id in ('avatars','system') );

-- Authenticated users can upload / replace / delete files.
drop policy if exists "avatars_auth_write" on storage.objects;
create policy "avatars_auth_write"
  on storage.objects for insert
  with check ( bucket_id in ('avatars','system') and auth.role() = 'authenticated' );

drop policy if exists "avatars_auth_update" on storage.objects;
create policy "avatars_auth_update"
  on storage.objects for update
  using ( bucket_id in ('avatars','system') and auth.role() = 'authenticated' );

drop policy if exists "avatars_auth_delete" on storage.objects;
create policy "avatars_auth_delete"
  on storage.objects for delete
  using ( bucket_id in ('avatars','system') and auth.role() = 'authenticated' );
