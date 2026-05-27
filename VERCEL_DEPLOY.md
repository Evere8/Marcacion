# Deploy en Vercel — Guía rápida

## El error que ves
El repo tiene `backend/`, `frontend/` y `supabase/` en la raíz. Vercel no
sabe cuál compilar y falla. Con el `vercel.json` que está en la raíz se
arregla automáticamente, PERO necesitas además ajustar 2 cositas en el
panel de Vercel:

## Pasos en Vercel (1 sola vez)

1. Entra a tu proyecto en https://vercel.com → **Settings → General**.
2. Busca **"Root Directory"** y déjalo VACÍO (sin tocar) — el `vercel.json`
   ya apunta a `frontend/`.
   > Si tenías "frontend" puesto antes, BÓRRALO y deja vacío. Si lo dejas
   > en "frontend", se va a confundir con el `vercel.json` de la raíz.
3. Build & Output Settings → **deja todo en "Override OFF"** (que use lo
   del `vercel.json`).
4. **Environment Variables** → asegurate de tener:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`
   - `REACT_APP_VAPID_PUBLIC_KEY` (si usás push)
5. Apretá **"Redeploy"** (botón arriba a la derecha → "Redeploy" sin caché).

## Opción alternativa (más simple)
Si no querés usar `vercel.json`:
1. Borrá el archivo `vercel.json` de la raíz.
2. En Vercel → Settings → General → **Root Directory = `frontend`** y guarda.
3. Redeploy.

Las dos opciones funcionan. Usa una sola, no las mezcles.
