-- ============================================================
-- ALFATWIN  -- 06_admin_delete.sql  (run ONCE in SQL Editor)
-- Lets the admin delete a user from BOTH public.profiles AND auth.users.
-- ============================================================

create or replace function public.admin_delete_user(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  -- delete from auth.users first; profile cascades via FK ON DELETE CASCADE.
  delete from auth.users where id = target_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
