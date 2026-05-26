import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SystemConfigProvider } from './contexts/SystemConfigContext';
import { Toaster } from './components/ui/sonner';
import Login from './pages/Login';
import AdminLayout from './components/Layout/AdminLayout';
import StaffLayout from './components/Layout/StaffLayout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminPersonal from './pages/admin/Personal';
import AdminEmpleadoDetail from './pages/admin/EmpleadoDetail';
import AdminTasks from './pages/admin/Tasks';
import AdminTaskDetail from './pages/admin/TaskDetail';
import AdminChecklist from './pages/admin/Checklist';
import AdminReports from './pages/admin/Reports';
import AdminConfig from './pages/admin/Config';
import StaffHome from './pages/staff/Home';
import StaffClockIn from './pages/staff/ClockIn';
import StaffHistory from './pages/staff/History';
import StaffTasks from './pages/staff/Tasks';
import StaffTaskDetail from './pages/staff/TaskDetail';
import StaffChecklist from './pages/staff/Checklist';
import ProfileRetry from './components/ProfileRetry';
import PushPrompt from './components/PushPrompt';
import './App.css';

function RoleGate({ role, children }) {
  const { session, profile, profileMissing, loading, retryLoadProfile } = useAuth();
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (session && !profile && !profileMissing) {
      const t = setTimeout(() => setStuck(true), 6000);
      return () => clearTimeout(t);
    }
    setStuck(false);
  }, [session, profile, profileMissing]);

  if (loading) return <div className="min-h-screen grid place-items-center text-zinc-500">Cargando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) {
    if (profileMissing || stuck) return <ProfileRetry />;
    return (
      <div className="min-h-screen grid place-items-center text-zinc-500 gap-3 flex-col">
        <div>Preparando perfil…</div>
        <button
          onClick={() => retryLoadProfile()}
          className="text-xs text-gold underline"
          data-testid="profile-prepare-retry"
        >
          Tarda demasiado, reintentar
        </button>
      </div>
    );
  }
  if (!profile.activo) return <div className="min-h-screen grid place-items-center text-zinc-400">Tu cuenta está desactivada.</div>;
  if (role && profile.rol !== role) return <Navigate to={profile.rol === 'admin' ? '/admin' : '/app'} replace />;
  return children;
}

function RootRedirect() {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-zinc-500">Cargando…</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (profile?.rol === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/app" replace />;
}

export default function App() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
    }
  }, []);
  return (
    <SystemConfigProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster richColors theme="dark" position="top-right" />
          <PushPrompt />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RootRedirect />} />
            <Route path="/admin" element={<RoleGate role="admin"><AdminLayout /></RoleGate>}>
              <Route index element={<AdminDashboard />} />
              <Route path="personal" element={<AdminPersonal />} />
              <Route path="personal/:id" element={<AdminEmpleadoDetail />} />
              <Route path="tareas" element={<AdminTasks />} />
              <Route path="tareas/:id" element={<AdminTaskDetail />} />
              <Route path="pendientes" element={<AdminChecklist />} />
              <Route path="reportes" element={<AdminReports />} />
              <Route path="config" element={<AdminConfig />} />
            </Route>
            <Route path="/app" element={<RoleGate role="personal"><StaffLayout /></RoleGate>}>
              <Route index element={<StaffHome />} />
              <Route path="marcar" element={<StaffClockIn />} />
              <Route path="historial" element={<StaffHistory />} />
              <Route path="tareas" element={<StaffTasks />} />
              <Route path="tareas/:id" element={<StaffTaskDetail />} />
              <Route path="pendientes" element={<StaffChecklist />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </SystemConfigProvider>
  );
}
