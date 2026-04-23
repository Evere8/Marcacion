import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSystemConfig } from '../../contexts/SystemConfigContext';
import { uploadSystemAsset } from '../../lib/upload';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Loader2, Save, Clock, Palette, User as UserIcon, Image as ImgIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function Config() {
  const { user, profile, refreshProfile } = useAuth();
  const { config, refresh } = useSystemConfig();
  const [hora_entrada, setHE] = useState('08:00');
  const [hora_salida, setHS] = useState('17:00');
  const [tol, setTol] = useState(10);
  const [busy, setBusy] = useState(false);

  const [nombreSys, setNombreSys] = useState(config.nombre_sistema);
  const [primary, setPrimary] = useState(config.color_primary);
  const [secondary, setSecondary] = useState(config.color_secondary);
  const [tagline, setTagline] = useState(config.tagline);
  const [logoFile, setLogoFile] = useState(null);

  const [email, setEmail] = useState(profile?.email || '');
  const [newPass, setNewPass] = useState('');
  const [adminNombre, setAdminNombre] = useState(profile?.nombre || '');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('attendance_config').select('*').limit(1).maybeSingle();
      if (data) { setHE(data.hora_entrada?.slice(0, 5) || '08:00'); setHS(data.hora_salida?.slice(0, 5) || '17:00'); setTol(data.tolerancia_minutos ?? 10); }
    })();
  }, []);
  useEffect(() => {
    setNombreSys(config.nombre_sistema); setPrimary(config.color_primary);
    setSecondary(config.color_secondary); setTagline(config.tagline);
  }, [config]);
  useEffect(() => { setEmail(profile?.email || ''); setAdminNombre(profile?.nombre || ''); }, [profile]);

  async function saveHours() {
    setBusy(true);
    try {
      const { data: existing } = await supabase.from('attendance_config').select('id').limit(1).maybeSingle();
      if (existing) await supabase.from('attendance_config').update({ hora_entrada, hora_salida, tolerancia_minutos: +tol }).eq('id', existing.id);
      else await supabase.from('attendance_config').insert({ hora_entrada, hora_salida, tolerancia_minutos: +tol });
      toast.success('Horarios guardados');
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function saveBranding() {
    setBusy(true);
    try {
      let logo = config.logo;
      if (logoFile) logo = await uploadSystemAsset(logoFile, 'logo');
      const { data: existing } = await supabase.from('system_config').select('id').limit(1).maybeSingle();
      const payload = { nombre_sistema: nombreSys, color_primary: primary, color_secondary: secondary, tagline, logo };
      if (existing) await supabase.from('system_config').update(payload).eq('id', existing.id);
      else await supabase.from('system_config').insert(payload);
      await refresh();
      toast.success('Identidad actualizada');
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  async function saveAdmin() {
    setBusy(true);
    try {
      const updates = {};
      if (email && email !== profile.email) updates.email = email;
      if (newPass) updates.password = newPass;
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.auth.updateUser(updates);
        if (error) throw error;
      }
      if (adminNombre !== profile.nombre || email !== profile.email) {
        await supabase.from('profiles').update({ nombre: adminNombre, email }).eq('id', user.id);
      }
      await refreshProfile();
      setNewPass('');
      toast.success('Perfil de administrador actualizado');
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 max-w-4xl" data-testid="admin-config-page">
      <header><p className="label-eyebrow">Ajustes</p><h1 className="text-3xl font-black tracking-tight">Configuración</h1></header>

      <section className="card-premium p-6 fade-up">
        <header className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gold/15 text-gold grid place-items-center"><Clock className="w-4 h-4" /></div>
          <div><p className="label-eyebrow">Horarios</p><h2 className="text-lg font-black">Jornada laboral</h2></div>
        </header>
        <div className="grid sm:grid-cols-3 gap-3">
          <div><Label className="label-eyebrow mb-2 block">Hora entrada</Label><Input type="time" value={hora_entrada} onChange={(e) => setHE(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="cfg-entrada" /></div>
          <div><Label className="label-eyebrow mb-2 block">Hora salida</Label><Input type="time" value={hora_salida} onChange={(e) => setHS(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="cfg-salida" /></div>
          <div><Label className="label-eyebrow mb-2 block">Tolerancia (min)</Label><Input type="number" value={tol} onChange={(e) => setTol(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="cfg-tolerancia" /></div>
        </div>
        <div className="mt-5"><button onClick={saveHours} disabled={busy} className="btn-gold flex items-center gap-2" data-testid="cfg-save-hours"><Save className="w-4 h-4" /> Guardar horarios</button></div>
      </section>

      <section className="card-premium p-6 fade-up">
        <header className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gold/15 text-gold grid place-items-center"><Palette className="w-4 h-4" /></div>
          <div><p className="label-eyebrow">Identidad</p><h2 className="text-lg font-black">Marca del sistema</h2></div>
        </header>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><Label className="label-eyebrow mb-2 block">Nombre del sistema</Label>
            <Input value={nombreSys} onChange={(e) => setNombreSys(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="cfg-nombre-sistema" /></div>
          <div className="sm:col-span-2"><Label className="label-eyebrow mb-2 block">Tagline</Label>
            <Input value={tagline} onChange={(e) => setTagline(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="cfg-tagline" /></div>
          <div><Label className="label-eyebrow mb-2 block">Color primario</Label>
            <div className="flex gap-2 items-center"><input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="w-11 h-11 rounded-xl bg-panel border border-white/10" data-testid="cfg-color-primary" />
              <Input value={primary} onChange={(e) => setPrimary(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl" /></div></div>
          <div><Label className="label-eyebrow mb-2 block">Color secundario</Label>
            <div className="flex gap-2 items-center"><input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} className="w-11 h-11 rounded-xl bg-panel border border-white/10" data-testid="cfg-color-secondary" />
              <Input value={secondary} onChange={(e) => setSecondary(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl" /></div></div>
          <div className="sm:col-span-2"><Label className="label-eyebrow mb-2 block">Logo</Label>
            <div className="flex items-center gap-3">
              <img src={config.logo} alt="" className="w-16 h-16 rounded-xl object-cover border border-white/10" />
              <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="text-sm text-zinc-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-full file:border-0 file:bg-gold file:text-obsidian file:font-bold" data-testid="cfg-logo-input" />
            </div></div>
        </div>
        <div className="mt-5"><button onClick={saveBranding} disabled={busy} className="btn-gold flex items-center gap-2" data-testid="cfg-save-branding"><ImgIcon className="w-4 h-4" /> Guardar identidad</button></div>
      </section>

      <section className="card-premium p-6 fade-up">
        <header className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gold/15 text-gold grid place-items-center"><UserIcon className="w-4 h-4" /></div>
          <div><p className="label-eyebrow">Cuenta</p><h2 className="text-lg font-black">Administrador</h2></div>
        </header>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label className="label-eyebrow mb-2 block">Nombre</Label><Input value={adminNombre} onChange={(e) => setAdminNombre(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="cfg-admin-nombre" /></div>
          <div><Label className="label-eyebrow mb-2 block">Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="cfg-admin-email" /></div>
          <div className="sm:col-span-2"><Label className="label-eyebrow mb-2 block">Nueva contraseña (opcional)</Label><Input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Dejar vacío para no cambiar" className="bg-panel border-white/10 h-11 rounded-xl" data-testid="cfg-admin-pass" /></div>
        </div>
        <div className="mt-5"><button onClick={saveAdmin} disabled={busy} className="btn-gold flex items-center gap-2" data-testid="cfg-save-admin"><Save className="w-4 h-4" /> Guardar credenciales</button></div>
      </section>

      {busy && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass rounded-full px-4 py-2 text-xs flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</div>}
    </div>
  );
}
