-- ============================================================
-- 10_notification_triggers.sql — TRIGGERS de notificaciones
-- (security definer, se ejecutan en el servidor; bypass RLS).
--
-- Soluciona el bug por el cual las notificaciones nunca llegaban al
-- admin: la RLS de `profiles` impide a un staff leer la lista de
-- admins desde el cliente, así que `notifyAllAdmins()` devolvía vacío
-- y nunca se insertaba la notificación. Los triggers se ejecutan en
-- el servidor, ven todo, e insertan las notificaciones siempre.
--
-- También agrega:
--   • Recordatorios de pendientes con `hora`: notificación 10 minutos
--     antes y otra al momento exacto de la hora (zona Paraguay).
--     Implementado vía pg_cron (corre cada minuto en el servidor —
--     funciona aunque la PWA esté cerrada).
--
-- Ejecutar en Supabase → SQL Editor → Run. Idempotente.
-- ============================================================

-- ============================================================
-- 1) NOTIFICACIÓN: marcación entrada / salida → todos los admins
-- ============================================================
create or replace function public.notify_admins_on_mark()
returns trigger language plpgsql security definer as $$
declare
  staff_name text;
  msg text;
  tipo_label text;
begin
  -- Si quien marca es admin, no notificar (auto-notificación inútil).
  if exists (select 1 from public.profiles where id = new.user_id and rol = 'admin') then
    return new;
  end if;

  select nombre into staff_name from public.profiles where id = new.user_id;
  tipo_label := case when new.tipo = 'entrada' then 'entrada' else 'salida' end;
  msg := coalesce(new.direccion_geolocalizada, 'Ubicación registrada')
         || ' · ' || to_char(new.hora, 'HH24:MI');

  insert into public.notifications (user_id, tipo, titulo, mensaje, link)
  select p.id, 'marcacion',
         coalesce(staff_name, 'Empleado') || ' marcó ' || tipo_label,
         msg,
         '/admin'
    from public.profiles p
   where p.rol = 'admin' and p.activo = true;

  return new;
end; $$;

drop trigger if exists trg_marks_notify_admins on public.marks;
create trigger trg_marks_notify_admins
  after insert on public.marks
  for each row execute function public.notify_admins_on_mark();

-- ============================================================
-- 2) NOTIFICACIÓN: nuevo mensaje en chat de tarea → contraparte
-- ============================================================
create or replace function public.notify_on_task_chat()
returns trigger language plpgsql security definer as $$
declare
  task_rec record;
  sender_name text;
  recipient_id uuid;
  recipient_link text;
begin
  select id, titulo, admin_id, assignee_id into task_rec
    from public.tasks where id = new.task_id;
  if not found then return new; end if;

  -- Si el sender es el assignee → notificar al admin; sino → notificar al assignee.
  if new.sender_id = task_rec.assignee_id then
    recipient_id := task_rec.admin_id;
    recipient_link := '/admin/tareas/' || new.task_id::text;
  else
    recipient_id := task_rec.assignee_id;
    recipient_link := '/app/tareas/' || new.task_id::text;
  end if;

  if recipient_id is null or recipient_id = new.sender_id then return new; end if;

  select nombre into sender_name from public.profiles where id = new.sender_id;

  insert into public.notifications (user_id, tipo, titulo, mensaje, link)
  values (
    recipient_id,
    'chat',
    'Mensaje en "' || task_rec.titulo || '"',
    coalesce(sender_name, 'Alguien') || ': ' || left(new.message, 80),
    recipient_link
  );

  return new;
end; $$;

drop trigger if exists trg_task_chat_notify on public.task_chat;
create trigger trg_task_chat_notify
  after insert on public.task_chat
  for each row execute function public.notify_on_task_chat();

-- ============================================================
-- 3) NOTIFICACIÓN: cambio de estado de tarea → admin
-- ============================================================
create or replace function public.notify_on_task_status_change()
returns trigger language plpgsql security definer as $$
declare
  staff_name text;
  estado_label text;
begin
  if new.estado is not distinct from old.estado then return new; end if;
  if new.admin_id is null then return new; end if;
  -- Si quien cambió fue el propio admin, no notificarse a sí mismo.
  if exists (select 1 from public.profiles where id = new.assignee_id and rol = 'admin') then
    return new;
  end if;

  estado_label := replace(new.estado, '_', ' ');
  select nombre into staff_name from public.profiles where id = new.assignee_id;

  insert into public.notifications (user_id, tipo, titulo, mensaje, link)
  values (
    new.admin_id,
    'tarea',
    'Tarea ' || estado_label,
    coalesce(staff_name, 'Empleado') || ' marcó "' || new.titulo || '" como ' || estado_label,
    '/admin/tareas/' || new.id::text
  );

  return new;
end; $$;

drop trigger if exists trg_tasks_notify_status on public.tasks;
create trigger trg_tasks_notify_status
  after update of estado on public.tasks
  for each row execute function public.notify_on_task_status_change();

-- ============================================================
-- 4) NOTIFICACIÓN: cambio de urgencia en tarea → assignee
-- ============================================================
create or replace function public.notify_on_task_urgencia_change()
returns trigger language plpgsql security definer as $$
declare
  urgencia_label text;
begin
  if new.urgencia is not distinct from old.urgencia then return new; end if;
  if new.assignee_id is null then return new; end if;

  urgencia_label := case new.urgencia
                      when 'rojo' then '🔴 URGENTE'
                      when 'amarillo' then '🟡 Apurar'
                      else '🟢 A tiempo' end;

  insert into public.notifications (user_id, tipo, titulo, mensaje, link)
  values (
    new.assignee_id,
    'tarea',
    'Cambio de prioridad: ' || urgencia_label,
    '"' || new.titulo || '" ahora es ' || urgencia_label,
    '/app/tareas/' || new.id::text
  );

  return new;
end; $$;

drop trigger if exists trg_tasks_notify_urgencia on public.tasks;
create trigger trg_tasks_notify_urgencia
  after update of urgencia on public.tasks
  for each row execute function public.notify_on_task_urgencia_change();

-- ============================================================
-- 5) NOTIFICACIÓN: nueva tarea → assignee
-- ============================================================
create or replace function public.notify_on_task_insert()
returns trigger language plpgsql security definer as $$
declare
  urgencia_label text;
begin
  if new.assignee_id is null then return new; end if;

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

drop trigger if exists trg_tasks_notify_insert on public.tasks;
create trigger trg_tasks_notify_insert
  after insert on public.tasks
  for each row execute function public.notify_on_task_insert();

-- ============================================================
-- 6) RECORDATORIOS DE PENDIENTES con hora
--    • 10 minutos antes
--    • Al momento exacto
--    Funciona aunque la PWA esté cerrada (corre en Postgres).
-- ============================================================

create or replace function public.checklist_remind_due()
returns void language plpgsql security definer as $$
declare
  py_now_time time;
  py_today date;
begin
  py_now_time := (now() at time zone 'America/Asuncion')::time;
  py_today    := (now() at time zone 'America/Asuncion')::date;

  -- (a) Aviso 10 minutos antes
  -- Buscamos pendientes cuya hora cae entre [now+9min, now+11min] (ventana de 2 min
  -- para tolerar jitter del cron). Evitamos duplicados con NOT EXISTS.
  insert into public.notifications (user_id, tipo, titulo, mensaje, link)
  select c.user_id,
         'alerta',
         '⏰ En 10 min: ' || c.titulo,
         'Recordatorio: a las ' || to_char(c.hora, 'HH24:MI') || ' tienes "' || c.titulo || '"',
         case when (select rol from public.profiles where id = c.user_id) = 'admin'
              then '/admin/pendientes' else '/app/pendientes' end
    from public.checklists c
   where c.fecha = py_today
     and c.completado = false
     and c.hora is not null
     and c.hora >  py_now_time
     and c.hora <= (py_now_time + interval '11 minutes')::time
     and c.hora >= (py_now_time + interval '9 minutes')::time
     and not exists (
       select 1 from public.notifications n
        where n.user_id = c.user_id
          and n.titulo = '⏰ En 10 min: ' || c.titulo
          and n.created_at >= (py_today::timestamp at time zone 'America/Asuncion')
     );

  -- (b) Aviso al momento exacto (ventana de 1 min)
  insert into public.notifications (user_id, tipo, titulo, mensaje, link)
  select c.user_id,
         'alerta',
         '🔔 ' || c.titulo,
         'Es hora: ' || c.titulo,
         case when (select rol from public.profiles where id = c.user_id) = 'admin'
              then '/admin/pendientes' else '/app/pendientes' end
    from public.checklists c
   where c.fecha = py_today
     and c.completado = false
     and c.hora is not null
     and c.hora <= py_now_time
     and c.hora >  (py_now_time - interval '1 minute')::time
     and not exists (
       select 1 from public.notifications n
        where n.user_id = c.user_id
          and n.titulo = '🔔 ' || c.titulo
          and n.created_at >= (py_today::timestamp at time zone 'America/Asuncion')
     );
end; $$;

-- Intentar habilitar pg_cron (disponible en Supabase Pro+).
-- Si tu plan no lo permite, este bloque no falla — la función queda creada
-- y puede ser llamada manualmente o vía Edge Function programada.
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron no disponible en este proyecto: %', sqlerrm;
  end;
end $$;

-- Programa el job cada minuto SI pg_cron está disponible.
do $$
declare
  jid bigint;
  has_cron boolean;
begin
  select exists (select 1 from pg_extension where extname = 'pg_cron') into has_cron;
  if not has_cron then
    raise notice 'pg_cron no instalado: los recordatorios se ejecutarán solo cuando la PWA esté abierta.';
    return;
  end if;
  select jobid into jid from cron.job where jobname = 'alfatwin_checklist_reminders';
  if jid is not null then
    perform cron.unschedule(jid);
  end if;
  perform cron.schedule(
    'alfatwin_checklist_reminders',
    '* * * * *',
    $sql$select public.checklist_remind_due();$sql$
  );
end $$;

-- ============================================================
-- 7) Refrescar PostgREST
-- ============================================================
notify pgrst, 'reload schema';
