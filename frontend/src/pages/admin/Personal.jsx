import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { uploadAvatar } from '../../lib/upload';
import { Plus, Edit2, Trash2, Power, PowerOff, User as UserIcon, Loader2, KeyRound, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { toast } from 'sonner';
import { Avatar } from './Dashboard';

const empty = { id: null, nombre: '', edad: '', telefono: '', direccion: '', email: '', password: '', foto_perfil: '', activo: true };

export default function Personal() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [pwdTarget, setPwdTarget] = useState(null); // {id, nombre}
  const [newPwd, setNewPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from('profiles').select('*').eq('rol', 'personal').order('created_at', { ascending: false });
    setList(data || []);
  }
  useEffect(() => { load(); }, []);
  useRealtime('admin_personal', (ch) => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, load);
  }, []);

  function openNew() { setForm(empty); setFile(null); setOpen(true); }
  function openEdit(p) { setForm({ ...p, password: '' }); setFile(null); setOpen(true); }

  async function save() {
    if (!form.nombre || !form.email) { toast.error('Nombre y email requeridos'); return; }
    setSaving(true);
    try {
      let avatar = form.foto_perfil || null;
      if (!form.id) {
        if (!form.password || form.password.length < 6) { toast.error('Contraseña mínimo 6 caracteres'); setSaving(false); return; }

        // Capture the admin session before signUp — supabase-js v2 will
        // replace the active session with the newly-created user's, which
        // (a) logs the admin out of the panel and (b) breaks the profile
        // upsert below because of RLS. We restore it right after.
        const { data: { session: adminSession } } = await supabase.auth.getSession();

        const { data: s, error: signErr } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { nombre: form.nombre, rol: 'personal' }, emailRedirectTo: window.location.origin },
        });
        if (signErr) throw signErr;
        const newId = s.user?.id;
        if (!newId) throw new Error('No se pudo crear el usuario');

        // Restore admin session so RLS lets us upsert the new profile
        // (and so the admin stays logged in).
        if (adminSession?.access_token && adminSession?.refresh_token) {
          await supabase.auth.setSession({
            access_token: adminSession.access_token,
            refresh_token: adminSession.refresh_token,
          });
        }

        if (file) {
          try { avatar = await uploadAvatar(newId, file); }
          catch (e) { console.warn('Avatar upload failed:', e); }
        }
        const { error: upErr } = await supabase.from('profiles').upsert({
          id: newId,
          email: form.email,
          nombre: form.nombre,
          edad: form.edad ? +form.edad : null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          foto_perfil: avatar,
          rol: 'personal',
          activo: true,
        });
        if (upErr) throw upErr;
        toast.success('Personal creado');
      } else {
        if (file) {
          try { avatar = await uploadAvatar(form.id, file); }
          catch (e) { console.warn('Avatar upload failed:', e); toast.error('No se pudo subir la foto, se guardó el resto'); }
        }
        const { error } = await supabase.from('profiles').update({
          nombre: form.nombre,
          edad: form.edad ? +form.edad : null,
          telefono: form.telefono || null,
          direccion: form.direccion || null,
          foto_perfil: avatar,
        }).eq('id', form.id);
        if (error) throw error;
        toast.success('Personal actualizado');
      }
      setOpen(false); load();
    } catch (e) {
      toast.error(e.message || 'Error al guardar');
    } finally { setSaving(false); }
  }

  async function toggleActivo(p) {
    await supabase.from('profiles').update({ activo: !p.activo }).eq('id', p.id);
    toast.success(!p.activo ? 'Activado' : 'Desactivado');
  }
  async function del(p) {
    if (!window.confirm(`Eliminar permanentemente a ${p.nombre}?\n\nEsto borra el usuario de la base de datos Y de la autenticación.`)) return;
    try {
      const { error } = await supabase.rpc('admin_delete_user', { target_id: p.id });
      if (error) throw error;
      toast.success('Usuario eliminado por completo');
      load();
    } catch (e) {
      toast.error(`No se pudo eliminar: ${e.message || e}. Asegúrate de haber ejecutado 06_admin_delete.sql.`);
    }
  }

  async function changePassword() {
    if (!pwdTarget) return;
    if (!newPwd || newPwd.length < 6) { toast.error('Mínimo 6 caracteres'); return; }
    setPwdSaving(true);
    try {
      const { error } = await supabase.rpc('admin_change_password', { target_id: pwdTarget.id, new_password: newPwd });
      if (error) throw error;
      toast.success(`Contraseña actualizada para ${pwdTarget.nombre}`);
      setPwdTarget(null); setNewPwd('');
    } catch (e) {
      toast.error(`No se pudo cambiar: ${e.message || e}. Asegúrate de haber ejecutado 12_staff_tasks_admin_tools.sql.`);
    } finally { setPwdSaving(false); }
  }

  const filtered = list.filter((p) => !q || `${p.nombre} ${p.email}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6" data-testid="admin-personal-page">
      <header className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
        <div>
          <p className="label-eyebrow">Equipo</p>
          <h1 className="text-3xl font-black tracking-tight">Personal</h1>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl flex-1 sm:w-64" data-testid="personal-search" />
          <button onClick={openNew} className="btn-gold flex items-center gap-2" data-testid="personal-new-button"><Plus className="w-4 h-4" /> Nuevo</button>
        </div>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((p) => (
          <div key={p.id} className="card-premium p-5 fade-up" data-testid={`personal-card-${p.id}`}>
            <Link to={`/admin/personal/${p.id}`} className="flex items-start gap-4 group" data-testid={`personal-open-${p.id}`}>
              <Avatar src={p.foto_perfil} name={p.nombre} size={54} />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-white truncate group-hover:text-gold transition-colors">{p.nombre}</p>
                <p className="text-xs text-zinc-500 truncate">{p.email}</p>
                <p className="text-xs text-zinc-600 truncate mt-1">{p.telefono || '—'}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {p.activo
                  ? <Badge className="bg-green-500/15 text-green-400 border-green-500/30">Activo</Badge>
                  : <Badge className="bg-zinc-700/40 text-zinc-400">Inactivo</Badge>}
                <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-gold transition-colors" />
              </div>
            </Link>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => openEdit(p)} className="btn-ghost flex items-center justify-center gap-1 !py-2" data-testid={`personal-edit-${p.id}`}><Edit2 className="w-3.5 h-3.5" /> Editar</button>
              <button onClick={() => { setPwdTarget({ id: p.id, nombre: p.nombre }); setNewPwd(''); }} className="btn-ghost flex items-center justify-center gap-1 !py-2" data-testid={`personal-pwd-${p.id}`}><KeyRound className="w-3.5 h-3.5" /> Contraseña</button>
              <button onClick={() => toggleActivo(p)} className="btn-ghost flex items-center justify-center gap-1 !py-2" data-testid={`personal-toggle-${p.id}`} title={p.activo ? 'Desactivar' : 'Activar'}>
                {p.activo ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />} {p.activo ? 'Desactivar' : 'Activar'}
              </button>
              <button onClick={() => del(p)} className="btn-ghost flex items-center justify-center gap-1 !py-2 hover:!bg-red-500/10 hover:!text-red-400" data-testid={`personal-delete-${p.id}`}><Trash2 className="w-3.5 h-3.5" /> Eliminar</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full card-premium p-10 text-center text-zinc-500">
            <UserIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Sin personal registrado todavía.</p>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-surface border-white/10 max-w-lg" data-testid="personal-form-dialog">
          <DialogHeader><DialogTitle>{form.id ? 'Editar personal' : 'Nuevo personal'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre*" value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} span testId="form-nombre" />
            <Field label="Email*" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} disabled={!!form.id} span testId="form-email" />
            {!form.id && <Field label="Contraseña*" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} span testId="form-password" />}
            <Field label="Edad" type="number" value={form.edad} onChange={(v) => setForm({ ...form, edad: v })} testId="form-edad" />
            <Field label="Teléfono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} testId="form-telefono" />
            <Field label="Dirección" value={form.direccion} onChange={(v) => setForm({ ...form, direccion: v })} span testId="form-direccion" />
            <div className="col-span-2">
              <Label className="label-eyebrow mb-2 block">Foto de perfil</Label>
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm text-zinc-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-full file:border-0 file:bg-gold file:text-obsidian file:font-bold" data-testid="form-avatar-input" />
              <p className="text-[10px] text-zinc-500 mt-1">La imagen se comprime automáticamente.</p>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="btn-ghost" data-testid="form-cancel">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-gold flex items-center gap-2" data-testid="form-save">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pwdTarget} onOpenChange={(v) => { if (!v) { setPwdTarget(null); setNewPwd(''); } }}>
        <DialogContent className="bg-surface border-white/10" data-testid="personal-pwd-dialog">
          <DialogHeader><DialogTitle>Cambiar contraseña{pwdTarget ? ` · ${pwdTarget.nombre}` : ''}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label className="label-eyebrow mb-2 block">Nueva contraseña (mínimo 6 caracteres)</Label>
            <Input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="bg-panel border-white/10 h-11 rounded-xl" data-testid="personal-pwd-input" autoFocus />
            <p className="text-xs text-zinc-500">El empleado podrá iniciar sesión con la nueva contraseña inmediatamente. Sus sesiones activas pueden seguir abiertas hasta el próximo refresh.</p>
          </div>
          <DialogFooter>
            <button onClick={() => { setPwdTarget(null); setNewPwd(''); }} className="btn-ghost">Cancelar</button>
            <button onClick={changePassword} disabled={pwdSaving} className="btn-gold flex items-center gap-2" data-testid="personal-pwd-save">
              {pwdSaving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar contraseña
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', disabled, span, testId }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <Label className="label-eyebrow mb-2 block">{label}</Label>
      <Input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="bg-panel border-white/10 h-11 rounded-xl focus-visible:ring-1 focus-visible:ring-gold" data-testid={testId} />
    </div>
  );
}
