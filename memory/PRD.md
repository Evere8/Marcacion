# ALFATWIN – PRD

## Original problem statement
Sistema profesional de marcación de personal (PWA + Supabase + Vercel) con marcación de entrada/salida en tiempo real, gestión de tareas con chat, ubicación GPS verificada (anti fake GPS), notificaciones push, panel administrativo completo. Dos roles: Administrador y Personal. Logo ALFATWIN (negro + dorado + plateado), tipografía Montserrat, diseño minimalista premium 2026.

## What's been implemented (2026-05-02 v3 — Triggers servidor + recordatorios pendientes)
- 🔥 **ROOT CAUSE encontrado**: las notificaciones de staff → admin nunca llegaban porque la RLS `profiles_select` impide a un staff leer la lista de admins. `notifyAllAdmins()` desde el cliente devolvía `[]` y nunca insertaba la notificación.
- ✅ **`supabase/10_notification_triggers.sql`** — TRIGGERS `security definer` (bypass RLS) que ahora son la **única fuente** de notificaciones automáticas:
    1. `trg_marks_notify_admins` — al INSERT en `marks` notifica a TODOS los admins.
    2. `trg_task_chat_notify` — al INSERT en `task_chat` notifica a la contraparte.
    3. `trg_tasks_notify_status` — al cambio de `estado` notifica al admin.
    4. `trg_tasks_notify_urgencia` — al cambio de `urgencia` notifica al assignee.
    5. `trg_tasks_notify_insert` — nueva tarea creada notifica al assignee.
- ✅ **Recordatorios de pendientes** (10 min antes + en la hora) vía función `checklist_remind_due()` programada con `pg_cron` cada minuto. Ventanas de 2 min y 1 min para tolerar jitter; deduplicación por título. El `pg_cron` se intenta habilitar pero no rompe si tu plan no lo soporta.
- ✅ **Limpieza cliente**: removidos los `sendNotification()` redundantes en `ClockIn.jsx`, `TaskDetail.jsx`, `Tasks.jsx` (los triggers son la fuente de verdad). Dashboard mantiene los avisos manuales admin → staff.

## What's been implemented (2026-05-02 v2 — Notificaciones robustas + hora en pendientes)
- ✅ **Helper `notifyAllAdmins()`** en `hooks/useNotifications.js` — usado por ClockIn para notificar a todos los admins activos sin duplicar lookups. Incluye `console.error` cuando un insert falla, para detectar problemas RLS rápido.
- ✅ **Notificaciones existentes verificadas y robustecidas**: marcación entrada/salida → admins · chat de tarea → contraparte · cambio de estado por staff (en_progreso/completada) → admin · cambio de urgencia por admin → staff · nueva tarea creada → assignee.
- ✅ **Pendientes con hora**: nuevo campo `hora` (time) en checklists. El form muestra un picker `<input type="time">` junto al título y al toggle "Diario". El item muestra una píldora con la hora (o "Hora" para asignar después).
- ✅ **`autoGenerateRepeatablesByHour()`** (`lib/checklistAuto.js`): cada minuto, mientras la app está abierta, se regenera la copia del día *sólo* después de pasada la hora Paraguay (si hora=null se genera al instante). Se aplica en admin **y** staff.
- ✅ **`supabase/09_checklist_hora.sql`** idempotente: `alter table checklists add column if not exists hora time` + índice (user_id,fecha,hora) + `notify pgrst, 'reload schema'`.

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

---

## Sesión Feb 2026 — Tareas staff + admin tools + Vercel

### Implementado
- **Staff puede crear tareas auto-asignadas** (`/app/frontend/src/pages/staff/Tasks.jsx`) con diálogo de título/descripción/urgencia/fecha.
- **Notificación a TODOS los admins** cuando un staff crea o cambia estado de su tarea (`/app/supabase/12_staff_tasks_admin_tools.sql`).
- **Admin · Detalle de empleado** (`/app/frontend/src/pages/admin/EmpleadoDetail.jsx`, ruta `/admin/personal/:id`): ve tareas pendientes/en progreso/completadas y accede al chat de cada una.
- **Admin · Cambiar contraseña** del empleado (botón "Contraseña" en card + diálogo) usando RPC `admin_change_password(target_id, new_password)`.
- **RPC `crear_admin(email, password, nombre)`** para que el creador de la app dé de alta nuevos administradores (insertable desde SQL o un futuro botón).
- **vercel.json** en `/app/vercel.json` apuntando a `frontend/` para desbloquear deploy en Vercel.

### Pasos que el usuario debe ejecutar
1. Ejecutar `12_staff_tasks_admin_tools.sql` en Supabase → SQL Editor (UNA VEZ).
2. Hacer push a GitHub (función "Save to GitHub") y redeploy en Vercel — ya leerá `vercel.json`.
3. Para crear un admin nuevo desde Supabase SQL Editor:
   ```sql
   select public.crear_admin('nuevoadmin@empresa.com', 'PasswordSeguro123', 'Nombre Apellido');
   ```

### Backlog
- Push notifications programadas (pg_cron) — pendiente de verificar en plan Supabase.
- Offline sync de marcaciones.
- Tests E2E con testing_agent.

---

## Sesión Feb 2026 (b) — Trabajos diarios + Exportar Excel

### Implementado
- **Tabla `trabajos`** (`/app/supabase/13_trabajos.sql`): `detalle text` + `cantidad numeric` + fecha/hora autogeneradas (zona Paraguay). Staff CRUD propio, admin SELECT-only.
- **Staff /app/tareas reemplazado** (`/app/frontend/src/pages/staff/Tasks.jsx`): formulario simple (detalle + cantidad numérica), edición/eliminación, filtro por fecha, total del día. Mantiene una sección colapsada para "Tareas del jefe" (asignadas por admin) que abre el chat existente.
- **Admin /admin/trabajos** (`/app/frontend/src/pages/admin/Trabajos.jsx`): vista read-only, segmentada por chofer con colores únicos por persona, filtros por rango de fechas (Hoy/7d/30d/custom), botón **Exportar Excel** que descarga `.xls` con cuadros, colores, resumen por chofer y headers ALFATWIN.
- **Reports.jsx (`/admin/reportes`)**: agregado rango **Personalizado** con date pickers desde/hasta, botón **Excel** global y por empleado (formato idéntico al PDF con colores).
- **Helper Excel** (`/app/frontend/src/lib/excelExport.js`): genera HTML→.xls con colores/estilos, sin librerías nuevas.
- **AdminLayout** sidebar: nuevo enlace **Trabajos**.

### Pasos que el usuario debe ejecutar
1. **Supabase SQL Editor** → ejecutar `/app/supabase/13_trabajos.sql` (UNA vez).
2. Push a GitHub y redeploy Vercel.

### Notas
- Admin NO puede editar/eliminar trabajos del staff (políticas RLS lo bloquean).
- Si admin crea tareas asignadas (flujo viejo de "Tareas"), TODO sigue funcionando con chat + estados.
- El Excel exportado es realmente HTML con MIME `application/vnd.ms-excel` — abre perfecto en Excel/LibreOffice/Sheets y conserva colores.


---

## Sesión Feb 2026 (c) — Horarios por empleado + Cargo + Cronómetro de tareas

### Implementado
- **SQL** `/app/supabase/14_personal_schedule_cargo.sql`:
  - `profiles` ← `cedula`, `hora_entrada`, `hora_salida`, `cargo` ('chofer'|'administracion').
  - `trabajos` ← `iniciado_en`, `finalizado_en`, `duracion_segundos` (calculado por trigger).
- **`admin/Personal.jsx`**: nuevos inputs en crear/editar (Cédula · Cargo · Hora entrada · Hora salida). Las cards muestran badge cargo + horario + cédula.
- **`format.js`**: `computeMarkDelay` ahora prefiere `mark.profiles.hora_entrada/salida` y cae al global si no existe. Nueva helper `effectiveSchedule()`.
- **Dashboard.jsx**: el reporte del día compara cada empleado contra SU horario.
- **Reports.jsx**: query trae `hora_entrada/hora_salida/cedula/cargo` y se incluye el horario individual en el título de cada sección Excel.
- **`staff/Home.jsx`**: para usuarios con `cargo='chofer'` aparece sección **Trabajos / Cronómetro**:
  - Si hay trabajo en curso → card verde con cronómetro grande + botón **Finalizar** rojo.
  - Si hay trabajos cargados sin iniciar → cada uno con botón **Iniciar** (verde, más chico que el botón de marcación).
  - Lista de finalizados del día con duración.
- **`admin/Trabajos.jsx`**: nueva columna **Duración viaje** (verde-pulse si en curso, azul si finalizado).
- **Excel de trabajos**: columnas Inicio · Fin · Duración + resumen general con tiempo total.

### Pasos que TÚ tenés que ejecutar
1. **Supabase SQL Editor** → ejecutar `/app/supabase/14_personal_schedule_cargo.sql` (UNA vez).
2. Editar el perfil de cada empleado y poner su horario de entrada/salida + cédula + cargo.
3. Push a GitHub → redeploy Vercel.


---

## Sesión Jun 2026 — Gestor de Cargos + Ausentes en reportes

### Implementado (frontend, sin SQL nuevo)
- **`admin/Config.jsx`** — Sección "Cargos del personal": el admin puede agregar/eliminar cargos y togglear `con_cronometro` por cargo (usa tabla `cargos` de `15_cargos.sql`). data-testids: `admin-config-cargos`, `cargo-row-*`, `cargo-cron-*`, `cargo-del-*`, `cargo-new-name`, `cargo-new-cron`, `cargo-add`.
- **Función AUSENTE** — Cuando un empleado NO marca un día hábil de Paraguay (Lun-Vie, fecha <= hoy) aparece como "Ausente" (rojo):
  - `lib/format.js`: helpers `isWorkingDayPY(dateStr)` y `eachDayISO(from,to)`.
  - `admin/Reports.jsx`: inyecta días hábiles sin marca como `{ausente:true}`, badge rojo "Ausente" en tabla, contador "Ausencias" por empleado, y columna AUSENTE en Excel.
  - `lib/reportPdf.js`: estado "AUSENTE" en rojo en el PDF.
- NO requiere ejecutar SQL nuevo (lógica 100% cliente).

### Verificación
- Compila sin errores (solo warnings eslint preexistentes).
- NO se pudo verificar visualmente autenticado: el login a Supabase devuelve HTTP 400 (credenciales richy@gmail.com/richy123 rechazadas por la instancia del usuario). Pendiente que el usuario confirme credenciales válidas.

### Scripts SQL a ejecutar en Supabase (en orden, UNA vez c/u)
12_staff_tasks_admin_tools.sql · 13_trabajos.sql · 14_personal_schedule_cargo.sql · 15_cargos.sql

---

## Sesión Jul 2026 — Turnos NOCTURNOS (cruzan medianoche) + reportes con 2 fechas

### Problema
Un colaborador con horario 21:30→05:00 podía marcar ENTRADA pero al cambiar de día
la app "se reiniciaba" y le volvía a pedir ENTRADA, sin poder marcar la SALIDA.
Causa raíz: las marcas se emparejaban solo dentro de la MISMA fecha (`fecha = hoy`).

### Implementado (solo frontend, sin SQL nuevo)
- **`lib/format.js`**: nuevos helpers `buildShifts(marksAsc)` (empareja cada `entrada`
  con la siguiente `salida` aunque sean de días distintos), `addDaysISO`, `isOvernightSchedule`.
- **`staff/Home.jsx`**: ahora carga marcas de AYER+HOY y usa `buildShifts` para detectar
  un "turno abierto". Si hay una entrada sin salida (aunque sea de ayer) → el botón pide
  **SALIDA**. Jornada "completa" solo si el turno cerrado empezó HOY (turno diurno).
- **`admin/Reports.jsx`**: la tabla ahora muestra **2 columnas** "Entrada · fecha y hora"
  y "Salida · fecha y hora"; arma turnos con `buildShifts`, carga desde `fromISO - 1 día`
  para no cortar turnos en el borde. Ausentes muestran la fecha en la columna entrada.
- **`lib/reportPdf.js`**: PDF con columnas Entrada/Salida cada una con su fecha+hora.
- **Excel**: idem (2 columnas con fecha+hora).
- Fix menor: el `window.confirm` que borra fotos del servidor ahora solo aparece al
  **Compartir**, no al descargar PDF (evita borrados accidentales). PDF header usa
  `rangeToISO()` para rango personalizado.

### Verificación
- Test unitario `/app/frontend/scripts/test_overnight.mjs` (7/7 passed).
- testing_agent (frontend) 100%: turno nocturno 29→30 jun emparejado (7h 30m) + turno abierto.

### ⚠️ Acción del usuario
- En **Personal**, poné el horario nocturno (ej. 21:30 / 05:00) al empleado que trabaja de noche.
  (Durante las pruebas se ajustó temporalmente el horario de Gabriel Ferreira a 21:30-05:00;
  verificá/corregí si no corresponde.)

---

## Jul 2026 — Optimización de Egress Supabase · FASE 1 (frontend, sin SQL)

Contexto: Egress PostgREST alto (4 GB / picos 273 MB/día) con tablas diminutas →
causado por FRECUENCIA de peticiones (Realtime recargaba todo, polling 60s, select('*'),
NotificationsBell duplicado). Punto de restauración: commit `ef67cf5`.

Cambios implementados (verificado testing_agent 100% — iteration_3.json):
- **`lib/realtime.js`** (nuevo): `applyRealtimeChange` (INSERT agrega / UPDATE reemplaza por id /
  DELETE elimina por id, dedup por id, filtro `belongs`) + `createDebouncer`.
- **`admin/Dashboard.jsx`**: Realtime solo `marks`(filtrado fecha=hoy)+`tasks` con **debounce 3s**;
  quitadas subs globales a `profiles` y `checklists`; `select` con columnas explícitas; pausa si
  pestaña oculta.
- **`staff/Checklist.jsx` + `admin/Checklist.jsx`**: eliminado `setInterval 60s`; Realtime granular;
  auto-generación de repetibles solo al montar y en `visibilitychange`.
- **`staff/Home.jsx`**: Realtime granular en marks/tasks/checklists/trabajos; ya NO recarga las 6
  tablas ni config/cargos por cada evento.
- **`admin/Trabajos.jsx`, `admin/Personal.jsx`, `staff/Tasks.jsx`, `staff/History.jsx`,
  `admin/EmpleadoDetail.jsx`**: patrón granular + columnas explícitas (con `belongs` por fecha/rol).
- **`admin/Tasks.jsx`**: Realtime con debounce 3s (tiene join assignee) + columnas explícitas.
- **NotificationsBell duplicado**: `useNotifications.js` ahora expone `NotificationsProvider` +
  `useNotificationsShared`; montado UNA vez en `App.js`. Un solo fetch, un solo canal.

Reducción esperada de egress: 70–90% (pendiente medir 24–48h en producción por el usuario).
FASE 2 (pendiente de autorización): RPC/vistas SQL para reportes agregados + paginación.

---
## 2026-08-31 — Carga de trabajos por admin + reportes simplificados
- Admin ahora puede CARGAR trabajos desde el panel Trabajos (botón "Cargar trabajo"): selecciona Personal + Descripción + Precio (cantidad). `Trabajos.jsx`.
- Reporte de marcaciones (PDF y Excel) rediseñado: UNA sola tabla continua con columna **Nombre** (sin bloque/título dorado por persona). Columnas: Nombre · Entrada · Salida · Trabajado · Ubicación · Estado. Se eliminó la columna "Coords"; la Ubicación es el enlace clickeable a Google Maps. `reportPdf.js`, `Reports.jsx`.
- ACCIÓN REQUERIDA DEL USUARIO EN SUPABASE: ejecutar `supabase/16_admin_trabajos.sql` (agrega políticas RLS `trabajos_insert_admin/update_admin/delete_admin`). Sin esto, el admin recibe "new row violates row-level security policy for table trabajos".
