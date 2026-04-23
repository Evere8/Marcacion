import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications, requestNotificationPermission } from '../hooks/useNotifications';
import { useNavigate } from 'react-router-dom';

export default function NotificationsBell() {
  const { items, unread, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();

  useEffect(() => { requestNotificationPermission(); }, []);
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-10 h-10 grid place-items-center rounded-full bg-white/5 hover:bg-white/10 text-zinc-300"
        data-testid="notifications-bell-button"
        aria-label="Notificaciones"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-obsidian text-[10px] font-black grid place-items-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-h-[460px] overflow-auto glass rounded-2xl p-2 z-50" data-testid="notifications-panel">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="label-eyebrow">Notificaciones</p>
            {unread > 0 && (
              <button className="text-[11px] text-gold font-bold uppercase tracking-wider" onClick={markAllRead} data-testid="notifications-markall-button">Marcar todas</button>
            )}
          </div>
          {items.length === 0 && <p className="px-4 py-8 text-center text-zinc-500 text-sm">Sin notificaciones</p>}
          <ul className="space-y-1">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  className={`w-full text-left rounded-xl px-3 py-3 transition-colors ${n.leido ? 'bg-transparent' : 'bg-gold/10'} hover:bg-white/5`}
                  onClick={() => { markRead(n.id); if (n.link) { nav(n.link); setOpen(false); } }}
                  data-testid={`notification-item-${n.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${n.leido ? 'bg-zinc-700' : 'bg-gold'}`}></span>
                    <p className="text-sm font-bold text-white truncate">{n.titulo}</p>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{n.mensaje}</p>
                  <p className="text-[10px] text-zinc-600 mt-1">{new Date(n.created_at).toLocaleString('es-ES')}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
