# 🔔 Web Push real (con la PWA cerrada) — Guía de despliegue

Esta guía configura **notificaciones push reales** en ALFATWIN para que lleguen al teléfono **incluso con la app cerrada**, usando solo Supabase + Vercel (sin servidor extra).

---

## Lo que ya está hecho en el código

| Pieza | Archivo | ¿Qué hace? |
|------|---------|-----------|
| Tabla `push_subscriptions` | `supabase/07_push.sql` | Almacena endpoint+claves de cada navegador suscrito |
| Service Worker push handler | `frontend/public/sw.js` | Recibe el push del SO y muestra la notificación |
| Helper de suscripción | `frontend/src/lib/webpush.js` | `subscribeToPush(userId)` / `unsubscribeFromPush(userId)` |
| UI prompt + toggle | `frontend/src/components/PushPrompt.jsx` | Banner `<PushPrompt />` y `<PushToggle />` |
| VAPID public key | `frontend/.env` (`REACT_APP_VAPID_PUBLIC_KEY`) | Ya configurada |
| Edge Function | `supabase/functions/send-push/index.ts` | Envía el push (Web Push protocol, aes128gcm + VAPID) |

---

## 🔑 Tus VAPID keys (guárdalas)

```
VAPID_PUBLIC_KEY  = BNTOe8JkjnPXZ6UF_8eF8FCDIRwh9DFMSJC96oX_z113wzWB1CDBJJWlOrZBj6MUuoKR3H7JV7RC1BfVif9DUyw
VAPID_PRIVATE_KEY = h1IQlMFF84LR0mI3StYRcyM4iD56WoBZSlUQ8kseA4M
VAPID_SUBJECT     = mailto:admin@alfatwin.app
```

> ⚠️ La **public key** ya está en `frontend/.env`. La **private key** NUNCA debe ir al frontend, solo a la Edge Function.

---

## Paso 1️⃣ — Crear la tabla en Supabase

1. Abre **Supabase Dashboard → SQL Editor → New query**.
2. Copia y pega el contenido de `/app/supabase/07_push.sql`.
3. Ejecuta (botón **Run**).

---

## Paso 2️⃣ — Desplegar la Edge Function `send-push`

### Opción A · Desde el Dashboard (más fácil, sin CLI)

1. Ve a **Supabase Dashboard → Edge Functions → Create a new function**.
2. Nombre: `send-push`.
3. **Pega el contenido** de `/app/supabase/functions/send-push/index.ts` en el editor.
4. Pulsa **Deploy function**.

### Opción B · Con Supabase CLI

```bash
supabase login
supabase link --project-ref iuibaxbcdxewrumhykzf
supabase functions deploy send-push --no-verify-jwt
```

> **Importante**: usa `--no-verify-jwt` (o desactiva *Verify JWT* en el dashboard) porque el Database Webhook llama a la función sin token de usuario.

---

## Paso 3️⃣ — Configurar los secrets de la función

En **Supabase Dashboard → Edge Functions → send-push → Secrets** añade:

| Key | Value |
|-----|-------|
| `VAPID_PUBLIC_KEY`  | `BNTOe8JkjnPXZ6UF_8eF8FCDIRwh9DFMSJC96oX_z113wzWB1CDBJJWlOrZBj6MUuoKR3H7JV7RC1BfVif9DUyw` |
| `VAPID_PRIVATE_KEY` | `h1IQlMFF84LR0mI3StYRcyM4iD56WoBZSlUQ8kseA4M` |
| `VAPID_SUBJECT`     | `mailto:admin@alfatwin.app` (cámbialo a tu email real) |

> `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya vienen pre-cargadas como secrets en cualquier Edge Function — no necesitas añadirlas.

Equivalente con CLI:

```bash
supabase secrets set VAPID_PUBLIC_KEY="BNTOe8JkjnPXZ6UF_8eF8FCDIRwh9DFMSJC96oX_z113wzWB1CDBJJWlOrZBj6MUuoKR3H7JV7RC1BfVif9DUyw"
supabase secrets set VAPID_PRIVATE_KEY="h1IQlMFF84LR0mI3StYRcyM4iD56WoBZSlUQ8kseA4M"
supabase secrets set VAPID_SUBJECT="mailto:admin@alfatwin.app"
```

---

## Paso 4️⃣ — Database Webhook que dispara el push

1. Ve a **Supabase Dashboard → Database → Webhooks → Create a new hook**.
2. Configura:
   - **Name**: `notifications_to_push`
   - **Table**: `notifications`
   - **Events**: ☑ Insert  (deja Update y Delete sin marcar)
   - **Type**: `Supabase Edge Functions`
   - **Edge Function**: `send-push`
   - **HTTP Method**: `POST`
   - **HTTP Headers**: deja los predeterminados
3. Pulsa **Create webhook**.

A partir de ahora, **cualquier inserción en `notifications`** (asignar tarea, mensaje en chat, marca de entrada, etc.) dispara automáticamente el push real al dispositivo del usuario.

---

## Paso 5️⃣ — Verificar en el navegador

### En desktop (Chrome/Edge/Firefox)

1. Abre la app en el preview o producción.
2. Espera 1.5s — aparece el banner dorado **"Activar notificaciones"** abajo a la derecha.
3. Pulsa **Activar** → el navegador pide permiso → acepta.
4. Para probar, abre Supabase → SQL Editor:
   ```sql
   insert into public.notifications (user_id, tipo, titulo, mensaje, link)
   values ('<TU_USER_ID>', 'test', '🚀 Funciona', 'Push real probando', '/admin');
   ```
5. Debe aparecer la notificación del SO. Cierra el navegador y repite — debe seguir llegando.

### En iPhone / iOS 16.4+

> iOS solo entrega Web Push si la PWA está **agregada a la pantalla de inicio**.

1. Abre la app en **Safari** (no en Chrome — Chrome iOS no soporta Web Push).
2. Toca el botón **Compartir → Agregar a pantalla de inicio**.
3. Abre la app desde el ícono de la pantalla de inicio (no desde Safari).
4. Pulsa **Activar notificaciones** → acepta el permiso.
5. Cierra completamente la app (gesto hacia arriba). Probar el SQL del paso anterior — debe llegar la notificación.

### En Android

Funciona en cualquier navegador moderno (Chrome, Edge, Firefox, Samsung Internet). No necesita instalar la PWA, pero si la instalas también funciona.

---

## Despliegue en Vercel

No requiere ningún paso extra:

- El Service Worker (`/sw.js`) se sirve automáticamente desde `public/`.
- `REACT_APP_VAPID_PUBLIC_KEY` ya está en el `.env` local; añádela también como **Environment Variable en Vercel** (Project → Settings → Environment Variables) con el mismo valor.
- La Edge Function vive en Supabase, así que Vercel no la necesita.
- El `manifest.json` ya está configurado.

```
Vercel → Settings → Environment Variables:
  REACT_APP_SUPABASE_URL        = https://iuibaxbcdxewrumhykzf.supabase.co
  REACT_APP_SUPABASE_ANON_KEY   = (tu anon key)
  REACT_APP_VAPID_PUBLIC_KEY    = BNTOe8JkjnPXZ6UF_8eF8FCDIRwh9DFMSJC96oX_z113wzWB1CDBJJWlOrZBj6MUuoKR3H7JV7RC1BfVif9DUyw
```

Re-deploy y listo.

---

## Solución de problemas

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| El banner "Activar notificaciones" no aparece | Permisos ya concedidos o ya suscrito; o navegador no soporta Push | Mira la consola: si dice ya está activo, OK. En iOS recuerda instalar la PWA. |
| `Permiso denegado` al pulsar Activar | Bloqueado en el navegador | Ajustes del navegador → Privacidad → Notificaciones → quitar bloqueo del dominio |
| Insertaste en `notifications` pero no llega push | Webhook no creado o función no desplegada | Revisa **Database → Webhooks** y los logs de **Edge Functions → send-push** |
| Logs de la función dicen `401 Unauthorized` desde el endpoint del browser | Secrets VAPID mal configurados | Revisa que `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` estén exactos (sin espacios al final) |
| Push llega en desktop pero no en iPhone | App no instalada en pantalla de inicio | iOS exige PWA instalada para Web Push |

---

## Test manual rápido (curl)

Una vez desplegada la función puedes invocarla directamente:

```bash
curl -X POST 'https://iuibaxbcdxewrumhykzf.supabase.co/functions/v1/send-push' \
  -H "Authorization: Bearer <tu_service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"record":{"user_id":"<USER_UUID>","titulo":"Test","mensaje":"Hola","link":"/admin","tipo":"test"}}'
```

Si te responde `{"ok":true,"sent":N}` con N ≥ 1, todo funciona.
