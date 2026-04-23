import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Home, ClipboardList, History, CheckSquare, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Logo from '../Logo';
import NotificationsBell from '../NotificationsBell';
import { useLocationTracker } from '../../hooks/useLocationTracker';

const nav = [
  { to: '/app', icon: Home, label: 'Inicio', end: true },
  { to: '/app/tareas', icon: ClipboardList, label: 'Tareas' },
  { to: '/app/pendientes', icon: CheckSquare, label: 'Pendientes' },
  { to: '/app/historial', icon: History, label: 'Historial' },
];

export default function StaffLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  // Location tracker only activates if user opted in (stored in localStorage).
  useLocationTracker({ intervalMs: 15000 });

  return (
    <div className="min-h-screen flex flex-col bg-obsidian">
      <header className="sticky top-0 z-30 glass px-5 py-3 flex items-center justify-between safe-pt">
        <Logo size={36} />
        <div className="flex items-center gap-2">
          <NotificationsBell />
          <button
            onClick={() => { signOut(); navigate('/login'); }}
            className="w-10 h-10 grid place-items-center rounded-full bg-white/5 hover:bg-white/10 text-zinc-300"
            data-testid="staff-logout-button"
            aria-label="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="px-5 pt-2 pb-1">
        <p className="label-eyebrow">Empleado</p>
        <h1 className="text-2xl font-black tracking-tight truncate">{profile?.nombre}</h1>
      </div>

      <main className="flex-1 px-5 pb-32 pt-2"><Outlet /></main>

      <nav className="fixed bottom-0 inset-x-0 z-30 glass border-t border-white/5 safe-pb">
        <div className="grid grid-cols-4 gap-1 px-2 py-2 max-w-xl mx-auto">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  isActive ? 'text-gold' : 'text-zinc-500'
                }`
              }
              data-testid={`staff-nav-${n.label.toLowerCase()}`}
            ><n.icon className="w-5 h-5" />{n.label}</NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
