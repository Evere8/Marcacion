import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardList, Settings, LogOut, Bell } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Logo from '../Logo';
import NotificationsBell from '../NotificationsBell';

const nav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Panel', end: true },
  { to: '/admin/personal', icon: Users, label: 'Personal' },
  { to: '/admin/tareas', icon: ClipboardList, label: 'Tareas' },
  { to: '/admin/config', icon: Settings, label: 'Config' },
];

export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* SIDEBAR (desktop) */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-white/5 bg-panel sticky top-0 h-screen">
        <div className="p-6 border-b border-white/5"><Logo size={40} withText /></div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              data-testid={`admin-nav-${n.label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${
                  isActive ? 'bg-gold text-obsidian font-bold shadow-gold-soft' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <n.icon className="w-4 h-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-white/5">
          <div className="px-4 py-3 text-xs">
            <p className="label-eyebrow mb-1">Admin</p>
            <p className="text-white font-bold truncate">{profile?.nombre}</p>
            <p className="text-zinc-500 truncate">{profile?.email}</p>
          </div>
          <button
            onClick={() => { signOut(); navigate('/login'); }}
            data-testid="admin-logout-button"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
        </div>
      </aside>

      {/* MOBILE topbar */}
      <header className="md:hidden sticky top-0 z-30 glass px-5 py-3 flex items-center justify-between safe-pt">
        <Logo size={34} withText />
        <NotificationsBell />
      </header>

      {/* MAIN */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="hidden md:flex items-center justify-between px-8 py-5 border-b border-white/5 sticky top-0 glass z-20">
          <div><p className="label-eyebrow">Control de Personal</p><h1 className="text-xl font-black tracking-tight">Panel Administrativo</h1></div>
          <NotificationsBell />
        </header>
        <main className="flex-1 p-5 md:p-8 pb-28 md:pb-10"><Outlet /></main>
      </div>

      {/* MOBILE bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 glass border-t border-white/5 safe-pb">
        <div className="grid grid-cols-5 gap-1 px-2 py-2">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  isActive ? 'text-gold' : 'text-zinc-500'
                }`
              }
              data-testid={`admin-mobilenav-${n.label.toLowerCase()}`}
            ><n.icon className="w-5 h-5" />{n.label}</NavLink>
          ))}
          <button onClick={() => { signOut(); navigate('/login'); }}
            className="flex flex-col items-center gap-1 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider text-zinc-500"
            data-testid="admin-mobilenav-salir"
          ><LogOut className="w-5 h-5" />Salir</button>
        </div>
      </nav>
    </div>
  );
}
