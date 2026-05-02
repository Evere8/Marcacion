# ALFATWIN – PRD

## Original problem statement
Sistema profesional de marcación de personal (PWA + Supabase + Vercel) con marcación de entrada/salida en tiempo real, gestión de tareas con chat, ubicación GPS verificada (anti fake GPS), notificaciones push, panel administrativo completo. Dos roles: Administrador y Personal. Logo ALFATWIN (negro + dorado + plateado), tipografía Montserrat, diseño minimalista premium 2026.

## What's been implemented (2026-05-02 — UX fixes & push reliability)
- ✅ **Push subscription robusto**: `webpush.js` ahora hace *delete-then-insert* (scope `user_id+endpoint`) en vez de `upsert(onConflict:…)`. Soluciona el error "there is no unique or exclusion constraint matching the ON CONFLICT specification" que aparecía al activar notificaciones en iOS.
- ✅ **`supabase/07c_push_unique_fix.sql`** idempotente: re-crea tabla, de-duplica filas, asegura `UNIQUE(user_id, endpoint)`, RLS y `NOTIFY pgrst, 'reload schema'`. **Ejecutar una vez en Supabase SQL Editor**.
- ✅ **Hamburger menu en Admin (mobile)**: el bottom-nav saturado de 7 columnas se reemplazó por un botón hamburguesa en el topbar que abre un `<Sheet>` lateral con todas las secciones (Panel, Personal, Tareas, Pendientes, Reportes, Config, Salir).
- ✅ **Markers nombrados en mapa Admin**: cada marcación en el mapa muestra una píldora con el nombre del empleado siempre visible, con borde verde para entradas / azul para salidas.
- ✅ **Reports — UI simplificada**: se eliminó completamente la sección de "Destinatarios (correos)". Ahora hay dos botones globales y por empleado: **Descargar PDF** (descarga directa, sin correo) y **Compartir / Enviar** (Web Share API → permite enviar por correo/WhatsApp desde el dispositivo).
- ✅ **Personal — guardado de perfil resiliente**: al crear un nuevo empleado, el `signUp` de Supabase ya no desloguea al admin. La sesión del admin se captura antes y se restaura con `setSession()` después del `signUp`, garantizando que el upsert posterior del perfil no falle por RLS.

## Stack (user-chosen)
- Frontend: React 19 + React Router 7 + Tailwind + Shadcn UI (PWA, deployable a Vercel).
- Backend: Supabase (Auth · Postgres · Realtime · Storage). No FastAPI, no MongoDB.
- Mapas: Leaflet + OSM (CartoDB Dark tiles).
- Compresión de imagen: `browser-image-compression`.
- Notificaciones: Supabase Realtime → Web Notifications API + Service Worker + Web Push real (VAPID + Edge Function `send-push`).

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

## What's been implemented (2026-04-25 update v2 — Web Push real)
- ✅ **VAPID keys generadas** y guardadas (public en `frontend/.env` `REACT_APP_VAPID_PUBLIC_KEY`).
- ✅ **`supabase/07_push.sql`**: tabla `push_subscriptions` + RLS (cada usuario gestiona sus suscripciones).
- ✅ **Service Worker `sw.js` v6**: handler `push` rico (icon/badge/tag/vibrate) + `notificationclick` (abre/enfoca la app en el link), + `pushsubscriptionchange` (auto-resuscribe).
- ✅ **`frontend/src/lib/webpush.js`**: helpers `subscribeToPush`, `unsubscribeFromPush`, `getCurrentPushSubscription`, `attachResubscribeListener`, upsert idempotente por (user_id, endpoint).
- ✅ **`frontend/src/components/PushPrompt.jsx`**: banner dorado tras 1.5s para activar (con re-prompt cada 7 días si "después"); plus `<PushToggle />` para Config.
- ✅ Banner global `<PushPrompt />` montado en `App.js`.
- ✅ `<PushToggle />` añadido a Admin Config (sección "Notificaciones push") y a Staff Home (esquina superior).
- ✅ **Edge Function `send-push`** (`supabase/functions/send-push/index.ts`): implementación completa de Web Push aes128gcm + VAPID en Deno (sin librerías externas problemáticas), se dispara por Database Webhook al insertar en `notifications`. Auto-borra suscripciones expiradas (404/410).
- ✅ **Documentación de despliegue paso a paso**: `supabase/PUSH_DEPLOY.md` con instrucciones para Dashboard y CLI, configuración de secrets, webhook, prueba en iPhone/Android.

## What's been implemented (2026-04-25 update v1)
- ✅ **AuthContext refactor** (fix infinite "Preparando perfil…" hang): clean state-machine, REST profile fetch with hard timeout, single boot watchdog, optimistic signOut, visibility-aware re-fetch only when no profile.
- ✅ **TaskDetail urgency buttons** (admin): 3 grandes botones 🟢 A tiempo · 🟡 Apurar · 🔴 Urgente con notificación push al staff.
- ✅ **Optimistic updates everywhere**: Tasks list (urgencia), TaskDetail (urgencia, estado, chat enviado) — UI actualiza al instante sin esperar realtime.
- ✅ **Realtime granular** en TaskChatView: INSERT/UPDATE/DELETE de chat se aplican directamente al estado en lugar de re-fetch completo.
- ✅ **Notificación al admin** cuando staff cambia estado de tarea (En progreso / Completada).
- ✅ **Reporte de horarios** en Admin Dashboard: 4 KPIs (A tiempo, Tarde, Sin marcar, Salieron) + tabla por empleado con badge contra horario configurado y delta de minutos.
- ✅ **Recordatorio de marcación** (`useClockInReminder.js`): notificación local 10 min antes y 5 min después de la hora de entrada/salida si el staff aún no marcó.
- ✅ **Admin Pendientes** (`/admin/pendientes`): mismo flujo que staff checklist, accesible desde sidebar/mobile-nav, con sección quick-access en Dashboard.
- ✅ **Quick access pendientes en Staff Home** con botón "Mañana" para renovar.
- ✅ **Botón "Mañana"** (renovar al día siguiente) en items de staff Checklist y admin Checklist.
- ✅ **Editar marcación = actualizar GPS**: el botón editar en History.jsx ahora re-adquiere ubicación con GPS y ajusta la hora al momento del cambio (en lugar de editar la hora manualmente).

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
- **Web Push real con VAPID** (requiere VAPID keys + push subscription en backend) — actualmente solo notificaciones locales del Service Worker mientras la pestaña está abierta o la PWA instalada.
- Exportación CSV de marcaciones (admin).
- Reportes semanales por empleado (gráficos Recharts).
- Multi-site (sucursales) con geofencing.
- Caching offline avanzado (PWA SW para mutaciones offline en marcación).
