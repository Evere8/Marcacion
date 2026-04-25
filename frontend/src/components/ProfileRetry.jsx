import { RefreshCw, LogOut, Database } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';

export default function ProfileRetry() {
  const { signOut, retryLoadProfile } = useAuth();
  const [busy, setBusy] = useState(false);

  async function onRetry() {
    setBusy(true);
    try { await retryLoadProfile(); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen grid place-items-center px-5 py-10">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-8"><Logo size={72} withText /></div>
        <div className="card-premium p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-gold/15 text-gold grid place-items-center mx-auto mb-4">
            <Database className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-black tracking-tight mb-2">No pudimos cargar tu perfil</h1>
          <p className="text-sm text-zinc-400 font-light">
            Puede ser un problema temporal de conexión. Toca "Reintentar" o vuelve a iniciar sesión.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <button onClick={onRetry} disabled={busy} className="btn-gold flex-1 flex items-center justify-center gap-2" data-testid="profile-retry-button">
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Reintentar
            </button>
            <button onClick={signOut} className="btn-ghost flex items-center justify-center gap-2" data-testid="profile-signout-button">
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
