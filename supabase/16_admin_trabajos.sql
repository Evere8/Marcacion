-- ============================================================
-- 16_admin_trabajos.sql — Permitir que el ADMIN cargue trabajos
-- para cualquier personal (seleccionando personal + descripción + precio).
-- Las políticas previas solo permitían insertar los propios (user_id = auth.uid()).
-- ============================================================

drop policy if exists trabajos_insert_admin on public.trabajos;
create policy trabajos_insert_admin on public.trabajos
  for insert with check ( public.is_admin() );

-- (Opcional) permitir que el admin corrija/elimine trabajos cargados.
drop policy if exists trabajos_update_admin on public.trabajos;
create policy trabajos_update_admin on public.trabajos
  for update using ( public.is_admin() ) with check ( public.is_admin() );

drop policy if exists trabajos_delete_admin on public.trabajos;
create policy trabajos_delete_admin on public.trabajos
  for delete using ( public.is_admin() );

notify pgrst, 'reload schema';
