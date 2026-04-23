# ALFATWIN – Guía de Deploy en Vercel

## 1. Prerequisitos
- Proyecto Supabase ya creado (URL + anon key).
- Los 4 scripts SQL ejecutados en orden (ver `/app/supabase/README.md`).
- Usuario admin creado en **Supabase → Authentication → Users** (`richy@gmail.com` / `richy123`, Auto Confirm ✅).

## 2. Subir el código a GitHub
```
cd /app
git init
git add .
git commit -m "ALFATWIN MVP"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/alfatwin.git
git push -u origin main
```

## 3. Deploy en Vercel
1. Entra a https://vercel.com → **New Project** → importa el repo.
2. **Root Directory**: `frontend`.
3. **Framework Preset**: *Create React App* (auto-detectado).
4. Build command: `yarn build`. Output: `build`.
5. **Environment Variables**:
   - `REACT_APP_SUPABASE_URL` = `https://iuibaxbcdxewrumhykzf.supabase.co`
   - `REACT_APP_SUPABASE_ANON_KEY` = `<tu anon key>`
6. Deploy.

## 4. Configurar Supabase para producción
- **Authentication → URL Configuration**:
  - Site URL: `https://<tu-dominio>.vercel.app`
  - Redirect URLs: añade el dominio anterior.

## 5. PWA
- Abre la app en móvil → el navegador mostrará "Instalar App".
- En iOS Safari: Compartir → Añadir a pantalla de inicio.
- El Service Worker (`/sw.js`) se registra automáticamente y cachea el shell.

## 6. Notificaciones
- Al primer login la app solicita permiso de notificaciones.
- Las notificaciones se disparan vía **Supabase Realtime** cuando cualquier
  admin/empleado inserta en `public.notifications`, y se muestran via
  Notifications API + Service Worker.
