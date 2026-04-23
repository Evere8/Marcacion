import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSystemConfig } from '../contexts/SystemConfigContext';
import Logo from '../components/Logo';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { Loader2, LogIn } from 'lucide-react';

export default function Login() {
  const { signIn, session, profile, loading } = useAuth();
  const { config } = useSystemConfig();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  if (!loading && session && profile) {
    return <Navigate to={profile.rol === 'admin' ? '/admin' : '/app'} replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      toast.success('Bienvenido');
      nav('/');
    } catch (err) {
      toast.error(err.message || 'Credenciales inválidas');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-obsidian text-white">
      {/* LEFT VISUAL */}
      <div className="relative hidden md:flex items-center justify-center overflow-hidden">
        <img
          src="https://static.prod-images.emergentagent.com/jobs/890d0b19-1210-4f2a-9296-3f25eb035cc7/images/7df2901d89cfafc7cf0a6286bdfc8ceeb3062f21eaf4eabfff34103f42efbee9.png"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/80 via-black/55 to-black/90" />
        <div className="relative z-10 px-16 max-w-xl fade-up">
          <Logo size={88} />
          <h1 className="mt-10 text-5xl font-black tracking-tighter leading-[0.95] silver-gradient-text">
            Control<br />premium de<br /><span className="gold-gradient-text">tu personal.</span>
          </h1>
          <p className="mt-6 text-zinc-400 leading-relaxed max-w-md font-light">
            Marcaciones en tiempo real con geolocalización verificada, tareas con chat y notificaciones instantáneas. Una plataforma diseñada para operaciones exigentes.
          </p>
          <div className="mt-10 h-px w-24 bg-gradient-to-r from-gold to-transparent" />
          <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-gold font-bold">{config.tagline}</p>
        </div>
      </div>

      {/* RIGHT FORM */}
      <div className="flex items-center justify-center px-6 py-12 relative">
        <div className="w-full max-w-sm fade-up">
          <div className="md:hidden mb-10 flex justify-center"><Logo size={96} /></div>
          <p className="label-eyebrow mb-3">Acceso</p>
          <h2 className="text-3xl font-black tracking-tighter mb-1">Bienvenido</h2>
          <p className="text-zinc-400 text-sm font-light mb-10">Ingresa con tus credenciales para continuar.</p>

          <form onSubmit={onSubmit} className="space-y-5" data-testid="login-form">
            <div>
              <Label className="label-eyebrow mb-2 block">Correo</Label>
              <Input
                data-testid="login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
                required
                className="bg-panel border-white/10 h-12 rounded-xl focus-visible:ring-1 focus-visible:ring-gold"
              />
            </div>
            <div>
              <Label className="label-eyebrow mb-2 block">Contraseña</Label>
              <Input
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="bg-panel border-white/10 h-12 rounded-xl focus-visible:ring-1 focus-visible:ring-gold"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="btn-gold w-full h-12 flex items-center justify-center gap-2"
              data-testid="login-submit-button"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Ingresar
            </button>
          </form>

          <div className="mt-10 border-t border-white/5 pt-6 text-xs text-zinc-500">
            <p>¿No tienes cuenta? Solicítala a tu administrador.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
