-- ============================================================
-- ALFATWIN  -- 02_rls.sql  (run SECOND)
-- Row-Level Security policies
-- ============================================================

-- helper: is_admin()
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.rol = 'admin' and p.activo = true
  );
$$;

-- ------------------------------------------------------------
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;

create policy profiles_select on public.profiles
  for select using ( auth.uid() = id or public.is_admin() );

create policy profiles_update_self on public.profiles
  for update using ( auth.uid() = id ) with check ( auth.uid() = id );

create policy profiles_admin_all on public.profiles
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ------------------------------------------------------------
alter table public.attendance_config enable row level security;
drop policy if exists attcfg_select on public.attendance_config;
drop policy if exists attcfg_admin on public.attendance_config;

create policy attcfg_select on public.attendance_config for select using ( auth.uid() is not null );
create policy attcfg_admin on public.attendance_config for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ------------------------------------------------------------
alter table public.system_config enable row level security;
drop policy if exists syscfg_select on public.system_config;
drop policy if exists syscfg_admin on public.system_config;

create policy syscfg_select on public.system_config for select using ( true );
create policy syscfg_admin on public.system_config for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ------------------------------------------------------------
alter table public.marks enable row level security;
drop policy if exists marks_select on public.marks;
drop policy if exists marks_insert on public.marks;
drop policy if exists marks_update_today on public.marks;
drop policy if exists marks_delete_today on public.marks;
drop policy if exists marks_admin_all on public.marks;

create policy marks_select on public.marks
  for select using ( user_id = auth.uid() or public.is_admin() );

create policy marks_insert on public.marks
  for insert with check ( user_id = auth.uid() );

create policy marks_update_today on public.marks
  for update using ( user_id = auth.uid() and fecha = current_date )
  with check ( user_id = auth.uid() and fecha = current_date );

create policy marks_delete_today on public.marks
  for delete using ( user_id = auth.uid() and fecha = current_date );

create policy marks_admin_all on public.marks
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ------------------------------------------------------------
alter table public.tasks enable row level security;
drop policy if exists tasks_select on public.tasks;
drop policy if exists tasks_update_assignee on public.tasks;
drop policy if exists tasks_admin_all on public.tasks;

create policy tasks_select on public.tasks
  for select using ( assignee_id = auth.uid() or admin_id = auth.uid() or public.is_admin() );

create policy tasks_update_assignee on public.tasks
  for update using ( assignee_id = auth.uid() ) with check ( assignee_id = auth.uid() );

create policy tasks_admin_all on public.tasks
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ------------------------------------------------------------
alter table public.task_chat enable row level security;
drop policy if exists taskchat_select on public.task_chat;
drop policy if exists taskchat_insert on public.task_chat;
drop policy if exists taskchat_update on public.task_chat;

create policy taskchat_select on public.task_chat
  for select using (
    public.is_admin() or exists (
      select 1 from public.tasks t
      where t.id = task_chat.task_id and (t.assignee_id = auth.uid() or t.admin_id = auth.uid())
    )
  );

create policy taskchat_insert on public.task_chat
  for insert with check (
    sender_id = auth.uid() and (
      public.is_admin() or exists (
        select 1 from public.tasks t
        where t.id = task_chat.task_id and (t.assignee_id = auth.uid() or t.admin_id = auth.uid())
      )
    )
  );

create policy taskchat_update on public.task_chat
  for update using (
    public.is_admin() or exists (
      select 1 from public.tasks t
      where t.id = task_chat.task_id and (t.assignee_id = auth.uid() or t.admin_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
alter table public.notifications enable row level security;
drop policy if exists notifs_select on public.notifications;
drop policy if exists notifs_update on public.notifications;
drop policy if exists notifs_insert on public.notifications;
drop policy if exists notifs_admin_all on public.notifications;

create policy notifs_select on public.notifications
  for select using ( user_id = auth.uid() or public.is_admin() );

create policy notifs_update on public.notifications
  for update using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

create policy notifs_insert on public.notifications
  for insert with check ( auth.uid() is not null );

create policy notifs_admin_all on public.notifications
  for all using ( public.is_admin() ) with check ( public.is_admin() );

-- ------------------------------------------------------------
alter table public.checklists enable row level security;
drop policy if exists checklists_own on public.checklists;
drop policy if exists checklists_admin on public.checklists;

create policy checklists_own on public.checklists
  for all using ( user_id = auth.uid() ) with check ( user_id = auth.uid() );

create policy checklists_admin on public.checklists
  for select using ( public.is_admin() );
