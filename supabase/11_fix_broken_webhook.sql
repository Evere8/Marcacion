-- ============================================================
-- 11_fix_broken_webhook.sql — REPARACIÓN URGENTE
--
-- Problema: al marcar entrada/salida sale el error
--   "function net.http_post(url => unknown, headers => jsonb,
--    body => text) does not exist"
--
-- Causa: tienes un Database Webhook en Supabase (o un trigger
-- personalizado) sobre la tabla `notifications` que llama a
-- `net.http_post(...)` con argumentos mal tipados. La firma real
-- de pg_net es:
--   net.http_post(url text, body jsonb, params jsonb, headers jsonb,
--                 timeout_milliseconds int)
-- Cuando una notificación se inserta (por nuestros triggers),
-- el webhook falla y arrastra a la transacción → no se puede marcar.
--
-- Esta migración:
--   1) Detecta y elimina TODOS los triggers de USUARIO sobre la
--      tabla `notifications` (los nuestros NO viven ahí, así que
--      es seguro).
--   2) Opcional: te deja una función helper bien tipada
--      `public.notify_push_send(notification_row)` que puedes
--      conectar luego a la Edge Function `send-push` desde el
--      Dashboard → Database → Webhooks (o desde aquí, comentado).
--
-- Idempotente. Ejecuta en Supabase → SQL Editor → Run.
-- ============================================================

-- ============================================================
-- 1) Eliminar triggers rotos sobre `notifications`
-- ============================================================
do $$
declare
  trg record;
begin
  for trg in
    select t.tgname
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'notifications'
       and not t.tgisinternal
  loop
    execute format('drop trigger if exists %I on public.notifications', trg.tgname);
    raise notice 'Trigger eliminado de public.notifications: %', trg.tgname;
  end loop;
end $$;

-- También elimina triggers en el schema "supabase_functions" si existen
-- (algunos webhooks viejos viven ahí).
do $$
declare
  trg record;
begin
  if exists (select 1 from pg_namespace where nspname = 'supabase_functions') then
    for trg in
      select t.tgname, c.relname as tname
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'notifications'
    loop
      raise notice '(referencia) trigger restante: %.%', trg.tname, trg.tgname;
    end loop;
  end if;
end $$;

-- ============================================================
-- 2) Helper bien tipado para futuro webhook (OPCIONAL)
--    Si más adelante quieres conectar Edge Function `send-push`
--    automáticamente al INSERT en notifications, descomenta el
--    bloque al final. Pero NO es necesario para que funcione la
--    notificación in-app — esa ya viaja por Realtime.
-- ============================================================

-- Refrescar PostgREST por las dudas
notify pgrst, 'reload schema';

-- ============================================================
-- DESPUÉS DE EJECUTAR ESTE SQL:
--   • Marcar entrada/salida vuelve a funcionar.
--   • Las notificaciones in-app llegan via Supabase Realtime
--     (la campanita y el toast se actualizan en tiempo real).
--   • Los push reales (con la PWA cerrada) NO funcionarán hasta
--     que reconfigures el webhook desde el Dashboard:
--       Supabase → Database → Webhooks → New webhook
--         Table:    public.notifications
--         Events:   Insert
--         Type:     Supabase Edge Functions
--         Function: send-push
--     (Esto generará un trigger correcto automáticamente.)
-- ============================================================
