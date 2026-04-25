# ALFATWIN – Supabase Setup

Run the SQL files **in order** in the Supabase SQL Editor (Dashboard → SQL Editor → New Query):

1. `01_schema.sql` – tables, triggers, realtime.
2. `02_rls.sql`    – row-level security policies.
3. `03_storage.sql`– storage buckets (`avatars`, `system`) + policies.
4. Create admin user in **Authentication → Users → Add user**:
   - email: `richy@gmail.com`
   - password: `richy123`
   - ✅ Auto Confirm User
5. `04_seed.sql` – defaults + promote Richy to admin.
6. `06_admin_delete.sql` – RPC para borrar usuario en cascada (auth + profile).

## Frontend env (already configured)

`/app/frontend/.env`
```
REACT_APP_SUPABASE_URL=https://iuibaxbcdxewrumhykzf.supabase.co
REACT_APP_SUPABASE_ANON_KEY=<anon key>
```

## Vercel deploy

Framework: **Create React App** · Build: `yarn build` · Output: `build`.
Add the two env vars above in **Project → Settings → Environment Variables**, then deploy.

## URL Config (so email links work)

Supabase → **Authentication → URL Configuration**
- Site URL: your Vercel domain (e.g. `https://alfatwin.vercel.app`)
- Redirect URLs: add the Vercel domain + any preview URL.
