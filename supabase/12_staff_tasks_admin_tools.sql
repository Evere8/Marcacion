-- ============================================================
-- 12_staff_tasks_admin_tools.sql
-- Nuevas funciones para:
--   1) Permitir que el PERSONAL cree sus propias tareas (auto-asignadas).
--   2) Notificar a TODOS los admins cuando un staff crea una tarea o
--      cambia el estado de una tarea propia.
--   3) RPC `admin_change_password(target_id, new_password)` para que el
--      admin pueda resetear la contraseña de un empleado.
--   4) RPC `crear_admin(p_email, p_password, p_nombre)` para que el
--      creador de la app pueda dar de alta nuevos administradores.
--
-- Ejecutar UNA SOLA VEZ en Supabase → SQL Editor → Run.
-- Es idempotente (puede correrse de nuevo sin romper nada).
-- ============================================================

-- pgcrypto necesario para encriptar contraseñas (bf = bcrypt)
create extension if not exists "pgcrypto";

-- ============================================================
-- 1) STAFF puede crear tareas auto-asignadas
-- ============================================================
drop policy if exists tasks_insert_self on public.tasks;
create policy tasks_insert_self on public.tasks
  for insert
  with check (
    -- Admin puede insertar cualquier tarea (cubierto por tasks_admin_all,
    -- pero lo dejamos explícito para que la política de staff funcione)
    public.is_admin()
    or (
      -- Staff solo puede crear tareas para sí mismo
      assignee_id = auth.uid()
    )
  );

-- ============================================================
-- 2a) Notificar a todos los admins cuando STAFF crea tarea propia
-- ============================================================
create or replace function public.notify_admins_on_staff_task()
returns trigger language plpgsql security definer as $$
declare
  staff_name text;
  urgencia_label text;
begin
  -- Solo si el creador (auth.uid()) es el mismo assignee → fue staff auto-asignado
  if auth.uid() is null or auth.uid() <> new.assignee_id then
    return new;
  end if;
  -- Si el assignee es admin no enviamos (sería self-notify)
  if exists (select 1 from public.profiles where id = new.assignee_id and rol = 'admin') then
    return new;
  end if;

  select nombre into staff_name from public.profiles where id = new.assignee_id;
  urgencia_label := case new.urgencia
                      when 'rojo' then '🔴 Urgente'
                      when 'amarillo' then '🟡 Importante'
                      else '🟢 Normal' end;

  insert into public.notifications (user_id, tipo, titulo, mensaje, link)
  select p.id, 'tarea',
         'Nueva tarea de ' || coalesce(staff_name, 'empleado'),
         new.titulo || ' (' || urgencia_label || ')',
         '/admin/tareas/' || new.id::text
    from public.profiles p
   where p.rol = 'admin' and p.activo = true;

  return new;
end; $$;

drop trigger if exists trg_tasks_notify_admins_staff on public.tasks;
create trigger trg_tasks_notify_admins_staff
  after insert on public.tasks
  for each row execute function public.notify_admins_on_staff_task();

-- ============================================================
-- 2b) Ajustar el trigger de inserción para NO notificar al assignee
--     cuando él mismo fue el creador (evita "me notifico a mí mismo")
-- ============================================================
create or replace function public.notify_on_task_insert()
returns trigger language plpgsql security definer as $$
declare
  urgencia_label text;
begin
  if new.assignee_id is null then return new; end if;
  -- Si el creador es el mismo assignee, no notificar (lo crea él mismo)
  if auth.uid() = new.assignee_id then return new; end if;

  urgencia_label := case new.urgencia
                      when 'rojo' then '🔴 Urgente'
                      when 'amarillo' then '🟡 Importante'
                      else '🟢 Normal' end;

  insert into public.notifications (user_id, tipo, titulo, mensaje, link)
  values (
    new.assignee_id,
    'tarea',
    'Nueva tarea asignada',
    new.titulo || ' (' || urgencia_label || ')',
    '/app/tareas/' || new.id::text
  );

  return new;
end; $$;

-- ============================================================
-- 2c) Cambio de estado por STAFF → notificar a TODOS los admins
--     (el trigger anterior solo notificaba al admin_id, que ahora
--      puede ser NULL si la tarea fue creada por el staff)
-- ============================================================
create or replace function public.notify_on_task_status_change()
returns trigger language plpgsql security definer as $$
declare
  staff_name text;
  estado_label text;
begin
  if new.estado is not distinct from old.estado then return new; end if;
  -- Si quien cambió fue admin (auto-asignación) ignorar
  if exists (select 1 from public.profiles where id = new.assignee_id and rol = 'admin') then
    return new;
  end if;

  estado_label := replace(new.estado, '_', ' ');
  select nombre into staff_name from public.profiles where id = new.assignee_id;

  -- Notificar al admin_id si existe…
  if new.admin_id is not null then
    insert into public.notifications (user_id, tipo, titulo, mensaje, link)
    values (
      new.admin_id,
      'tarea',
      'Tarea ' || estado_label,
      coalesce(staff_name, 'Empleado') || ' marcó "' || new.titulo || '" como ' || estado_label,
      '/admin/tareas/' || new.id::text
    );
  end if;

  -- …y a todos los demás admins activos (excluyendo al admin_id ya notificado)
  insert into public.notifications (user_id, tipo, titulo, mensaje, link)
  select p.id, 'tarea',
         'Tarea ' || estado_label,
         coalesce(staff_name, 'Empleado') || ' marcó "' || new.titulo || '" como ' || estado_label,
         '/admin/tareas/' || new.id::text
    from public.profiles p
   where p.rol = 'admin' and p.activo = true
     and (new.admin_id is null or p.id <> new.admin_id);

  return new;
end; $$;

-- ============================================================
-- 3) RPC para que el admin cambie la contraseña de un empleado
-- ============================================================
create or replace function public.admin_change_password(target_id uuid, new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  if new_password is null or length(new_password) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;

  update auth.users
     set encrypted_password = crypt(new_password, gen_salt('bf')),
         updated_at = now()
   where id = target_id;

  if not found then
    raise exception 'Usuario no encontrado';
  end if;
end;
$$;

revoke all on function public.admin_change_password(uuid, text) from public;
grant execute on function public.admin_change_password(uuid, text) to authenticated;

-- ============================================================
-- 4) RPC para crear un NUEVO ADMINISTRADOR
--    Solo lo puede ejecutar:
--      • un admin existente, O
--      • cuando NO existe todavía ningún admin (bootstrap inicial)
--    Inserta directamente en auth.users + profiles con rol='admin'.
-- ============================================================
create or replace function public.crear_admin(
  p_email text,
  p_password text,
  p_nombre text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  exists_admin boolean;
begin
  -- Permisos: admin existente O no hay ningún admin (primer admin)
  select exists(select 1 from public.profiles where rol = 'admin' and activo = true) into exists_admin;
  if exists_admin and not public.is_admin() then
    raise exception 'Solo un admin puede crear otros admins';
  end if;

  if p_email is null or length(p_email) < 5 then raise exception 'Email inválido'; end if;
  if p_password is null or length(p_password) < 6 then raise exception 'Contraseña mínima 6 caracteres'; end if;
  if p_nombre is null or length(p_nombre) < 2 then raise exception 'Nombre requerido'; end if;

  if exists(select 1 from auth.users where email = p_email) then
    raise exception 'Ya existe un usuario con ese email';
  end if;

  new_id := gen_random_uuid();

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    new_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('nombre', p_nombre, 'rol', 'admin'),
    now(), now(), '', '', '', ''
  );

  -- Crear identidad (necesaria para login email/password en Supabase Auth)
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), new_id,
    jsonb_build_object('sub', new_id::text, 'email', p_email, 'email_verified', true),
    'email', p_email, now(), now(), now()
  );

  -- handle_new_user() ya habrá creado el perfil con rol según meta, pero
  -- forzamos rol='admin' por las dudas (idempotente).
  insert into public.profiles (id, email, nombre, rol, activo)
  values (new_id, p_email, p_nombre, 'admin', true)
  on conflict (id) do update set rol = 'admin', activo = true, nombre = excluded.nombre;

  return new_id;
end;
$$;

revoke all on function public.crear_admin(text, text, text) from public;
grant execute on function public.crear_admin(text, text, text) to authenticated, anon;

-- ============================================================
-- 5) Refrescar PostgREST schema cache
-- ============================================================
notify pgrst, 'reload schema';
