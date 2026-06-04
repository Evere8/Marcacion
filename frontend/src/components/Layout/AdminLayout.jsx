import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, ClipboardList, Settings, LogOut, CheckSquare, FileText, Menu, Truck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import Logo from '../Logo';
import NotificationsBell from '../NotificationsBell';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';

const nav = [
  { to: '/admin', icon: LayoutDashboard, label: 'Panel', end: true },
  { to: '/admin/personal', icon: Users, label: 'Personal' },
  { to: '/admin/tareas', icon: ClipboardList, label: 'Tareas' },
  { to: '/admin/trabajos', icon: Truck, label: 'Trabajos' },
  { to: '/admin/pendientes', icon: CheckSquare, label: 'Pendientes' },
  { to: '/admin/reportes', icon: FileText, label: 'Reportes' },
  { to: '/admin/config', icon: Settings, label: 'Config' },
];

export default function AdminLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

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

      {/* MOBILE topbar with hamburger */}
      <header className="md:hidden sticky top-0 z-30 glass px-5 py-3 flex items-center justify-between safe-pt">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              className="w-10 h-10 rounded-xl grid place-items-center bg-white/5 border border-white/10 text-white hover:bg-gold/15 hover:border-gold/40 transition-all"
              data-testid="admin-mobile-menu-button"
              aria-label="Abrir menú"
            >
              <Menu className="w-5 h-5" />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="bg-panel border-white/10 w-72 p-0 flex flex-col"
            data-testid="admin-mobile-menu-sheet"
          >
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <Logo size={36} withText />
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-auto">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  onClick={() => setMenuOpen(false)}
                  data-testid={`admin-mobilenav-${n.label.toLowerCase()}`}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                      isActive ? 'bg-gold text-obsidian shadow-gold-soft' : 'text-zinc-300 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  <n.icon className="w-4 h-4" /> {n.label}
                </NavLink>
              ))}
            </nav>
            <div className="p-3 border-t border-white/10">
              <div className="px-4 py-3 text-xs">
                <p className="label-eyebrow mb-1">Admin</p>
                <p className="text-white font-bold truncate">{profile?.nombre}</p>
                <p className="text-zinc-500 truncate">{profile?.email}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); signOut(); navigate('/login'); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-zinc-300 hover:text-white hover:bg-red-500/10 transition-all"
                data-testid="admin-mobile-logout"
              >
                <LogOut className="w-4 h-4" /> Salir
              </button>
            </div>
          </SheetContent>
        </Sheet>
        <Logo size={32} withText={false} />
        <NotificationsBell />
      </header>

      {/* MAIN */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="hidden md:flex items-center justify-between px-8 py-5 border-b border-white/5 sticky top-0 glass z-20">
          <div><p className="label-eyebrow">Control de Personal</p><h1 className="text-xl font-black tracking-tight">Panel Administrativo</h1></div>
          <NotificationsBell />
        </header>
        <main className="flex-1 p-5 md:p-8 pb-10"><Outlet /></main>
      </div>
    </div>
  );
}
