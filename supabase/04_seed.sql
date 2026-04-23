-- ============================================================
-- ALFATWIN  -- 04_seed.sql  (run FOURTH)
-- Seed default data + promote Richy to admin.
--
-- Easiest way to create the admin user:
--   Supabase Dashboard → Authentication → Users → Add user
--   email:    richy@gmail.com
--   password: richy123
--   ✅ Auto Confirm User
--
-- Then run this script. It inserts the matching profile row
-- (if missing) and flags it as admin.
-- ============================================================

-- default attendance config
insert into public.attendance_config (hora_entrada, hora_salida, tolerancia_minutos)
select '08:00','17:00',10
where not exists (select 1 from public.attendance_config);

-- default system config
insert into public.system_config (nombre_sistema, color_primary, color_secondary, tagline, logo)
select 'ALFATWIN','#D4AF37','#E2E8F0','Conectamos Talento · Generamos Soluciones',
  'https://customer-assets.emergentagent.com/job_marking-system-1/artifacts/5lp911bj_WhatsApp%20Image%202026-04-19%20at%2018.27.56.jpeg'
where not exists (select 1 from public.system_config);

-- Ensure a profile row exists for richy@gmail.com (even if trigger didn't fire)
insert into public.profiles (id, email, nombre, rol, activo)
select u.id, u.email, 'Richy Admin', 'admin', true
  from auth.users u
 where u.email = 'richy@gmail.com'
   and not exists (select 1 from public.profiles p where p.id = u.id);

-- Promote richy@gmail.com to admin (in case profile existed already as 'personal')
update public.profiles
   set rol = 'admin',
       activo = true,
       nombre = coalesce(nullif(nombre,''),'Richy Admin')
 where email = 'richy@gmail.com';
