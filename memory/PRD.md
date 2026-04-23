# ALFATWIN – PRD

## Original problem statement
Sistema profesional de marcación de personal (PWA + Supabase + Vercel) con marcación de entrada/salida en tiempo real, gestión de tareas con chat, ubicación GPS verificada (anti fake GPS), notificaciones push, panel administrativo completo. Dos roles: Administrador y Personal. Logo ALFATWIN (negro + dorado + plateado), tipografía Montserrat, diseño minimalista premium 2026.

## Stack (user-chosen)
- Frontend: React 19 + React Router 7 + Tailwind + Shadcn UI (PWA, deployable a Vercel).
- Backend: Supabase (Auth · Postgres · Realtime · Storage). No FastAPI, no MongoDB.
- Mapas: Leaflet + OSM (CartoDB Dark tiles).
- Compresión de imagen: `browser-image-compression`.
- Notificaciones: Supabase Realtime → Web Notifications API + Service Worker.

## User personas
- **Admin (richy@gmail.com)**: gestiona personal, tareas, horarios, marca/notifica.
- **Personal**: marca entrada/salida, ve tareas, chatea con admin, gestiona pendientes.

## Core requirements (static)
- Roles con RLS estricto (admin vs personal).
- Marcación con GPS de alta precisión + detección de fake GPS.
- Chat por tarea en tiempo real.
- Push/realtime notifications con badge de no-leídas.
- PWA instalable (manifest + SW + icons desde logo).
- Configuración runtime del sistema (horarios, colores, logo, credenciales admin).

## What's been implemented (2026-04-23)
- ✅ SQL scripts completos (`/app/supabase/01_schema.sql`, `02_rls.sql`, `03_storage.sql`, `04_seed.sql`) con tablas, RLS, triggers (retrasos, auto-profile), realtime publication, buckets storage.
- ✅ Cliente Supabase + AuthContext + SystemConfigContext (colores/logo en vivo).
- ✅ Login premium (logo + hero + form).
- ✅ Layouts responsive (desktop sidebar + mobile bottom-nav).
- ✅ Admin Dashboard: KPIs, mapa Leaflet dark con pines dorados, lista de marcaciones live, pendientes de marcar + aviso masivo, atrasos, tareas urgentes.
- ✅ Admin Personal: CRUD + toggle activo + imagen comprimida (signUp).
- ✅ Admin Tareas: CRUD + urgencia (rojo/amarillo/verde) + notificación al asignar / cambiar urgencia.
- ✅ TaskDetail con chat realtime (admin y staff).
- ✅ Admin Config: horarios + identidad (nombre/tagline/colores/logo) + credenciales admin.
- ✅ Staff Home: reloj grande, botón masivo "Marcar" con estado actual.
- ✅ Staff ClockIn: pantalla de precisión GPS + anti-fake (heurísticas múltiples) + reverse geocode + audit de intentos bloqueados.
- ✅ Staff Historial: día/semana/mes · editar y borrar solo el día.
- ✅ Staff Checklist: crear, marcar, eliminar, repetible (auto-genera cada día).
- ✅ Notifications bell + browser notification on insert.
- ✅ PWA completa (manifest, SW con cache + push, icons 192/512 del logo).
- ✅ Setup screen que guía al usuario si las tablas aún no están creadas.
- ✅ Usuario admin `richy@gmail.com / richy123` YA creado en Supabase Auth.

## Pendiente de ejecución (del usuario, una sola vez)
1. Abrir Supabase Dashboard → SQL Editor.
2. Ejecutar en orden: `01_schema.sql`, `02_rls.sql`, `03_storage.sql`, `04_seed.sql` (archivos en `/app/supabase/`).
3. Recargar la app. La UI ya está 100% funcional.

## Deploy Vercel
- Framework: **Create React App** (root: `/frontend`). Build: `yarn build` · Output: `build`.
- Env vars: `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`.
- En Supabase → Authentication → URL Configuration: añadir dominio de Vercel.

## Backlog P1
- Web Push real con VAPID (requiere proyecto Firebase / self-hosted push server).
- Exportación CSV de marcaciones (admin).
- Reportes semanales por empleado (gráficos Recharts).
- Multi-site (sucursales) con geofencing.
