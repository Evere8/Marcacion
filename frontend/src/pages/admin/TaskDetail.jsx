import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useRealtime } from '../../hooks/useRealtime';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Send, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { sendNotification } from '../../hooks/useNotifications';

export default function AdminTaskDetail() {
  return <TaskChatView basePath="/admin/tareas" isAdmin />;
}

export function TaskChatView({ basePath, isAdmin }) {
  const { id } = useParams();
  const { user, profile } = useAuth();
  const [task, setTask] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef();

  async function load() {
    const { data: t } = await supabase.from('tasks').select('*, assignee:assignee_id(nombre), admin:admin_id(nombre)').eq('id', id).maybeSingle();
    setTask(t || null);
    const { data: m } = await supabase.from('task_chat').select('*, sender:sender_id(nombre,foto_perfil)').eq('task_id', id).order('created_at');
    setMessages(m || []);
    // mark chat messages as seen
    await supabase.from('task_chat').update({ visto: true }).eq('task_id', id).neq('sender_id', user.id).eq('visto', false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);
  useRealtime(`task_${id}`, (ch) => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'task_chat', filter: `task_id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `id=eq.${id}` }, load);
  }, [id]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length]);

  async function send() {
    if (!text.trim() || !task) return;
    setSending(true);
    try {
      const { error } = await supabase.from('task_chat').insert({ task_id: id, sender_id: user.id, message: text.trim() });
      if (error) throw error;
      const targetId = isAdmin ? task.assignee_id : task.admin_id;
      if (targetId) {
        await sendNotification(targetId, {
          tipo: 'chat',
          titulo: `Mensaje en "${task.titulo}"`,
          mensaje: `${profile?.nombre}: ${text.slice(0, 80)}`,
          link: `${basePath}/${id}`,
        });
      }
      setText('');
    } catch (e) { toast.error(e.message); } finally { setSending(false); }
  }

  async function deleteTask() {
    if (!window.confirm('Eliminar tarea?')) return;
    await supabase.from('tasks').delete().eq('id', id);
    toast.success('Eliminada');
    window.history.back();
  }

  async function setEstado(estado) {
    await supabase.from('tasks').update({ estado }).eq('id', id);
    if (!isAdmin && task.admin_id) {
      const labels = { pendiente: 'pendiente', en_progreso: 'en progreso', completada: 'completada' };
      await sendNotification(task.admin_id, {
        tipo: 'tarea',
        titulo: `Tarea ${labels[estado] || estado}`,
        mensaje: `${profile?.nombre} marcó "${task.titulo}" como ${labels[estado] || estado}`,
        link: `/admin/tareas/${id}`,
      });
    }
  }

  async function setUrgencia(urgencia) {
    if (!task) return;
    const prev = task.urgencia;
    setTask({ ...task, urgencia });
    const { error } = await supabase.from('tasks').update({ urgencia }).eq('id', id);
    if (error) {
      setTask({ ...task, urgencia: prev });
      toast.error(error.message);
      return;
    }
    if (isAdmin && task.assignee_id) {
      const labels = { rojo: '🔴 URGENTE', amarillo: '🟡 Apurar', verde: '🟢 A tiempo' };
      await sendNotification(task.assignee_id, {
        tipo: 'tarea',
        titulo: `Cambio de prioridad: ${labels[urgencia]}`,
        mensaje: `"${task.titulo}" ahora es ${labels[urgencia]}`,
        link: `/app/tareas/${id}`,
      });
      toast.success('Prioridad actualizada y notificada');
    }
  }

  if (!task) return <p className="text-zinc-500">Cargando tarea…</p>;

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-220px)]" data-testid="task-detail-page">
      <div className="card-premium p-5 mb-4">
        <Link to={basePath} className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-white mb-3"><ArrowLeft className="w-3.5 h-3.5" /> Volver</Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${task.urgencia === 'rojo' ? 'bg-red-500' : task.urgencia === 'amarillo' ? 'bg-yellow-400' : 'bg-green-500'}`} />
              <span className="label-eyebrow">{task.estado}</span>
            </div>
            <h1 className="text-2xl font-black tracking-tight mb-2">{task.titulo}</h1>
            <p className="text-zinc-400 font-light">{task.descripcion || '—'}</p>
            <p className="text-xs text-zinc-500 mt-3">Asignada a: <span className="text-white font-bold">{task.assignee?.nombre}</span> · Por: <span className="text-white font-bold">{task.admin?.nombre}</span></p>
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-2">
              <button onClick={deleteTask} className="btn-ghost !px-3 !py-2 hover:!bg-red-500/10 hover:!text-red-400" data-testid="task-delete-button"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          )}
        </div>
        {isAdmin && (
          <div className="mt-4 flex gap-2 flex-wrap" data-testid="task-urgency-controls">
            <button
              onClick={() => setUrgencia('verde')}
              className={`flex-1 min-w-[110px] py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${task.urgencia === 'verde' ? 'bg-green-500/20 text-green-300 border-green-500/40' : 'bg-white/5 text-zinc-400 border-white/10 hover:border-green-500/40 hover:text-green-300'}`}
              data-testid="task-urgency-verde"
            >
              🟢 A tiempo
            </button>
            <button
              onClick={() => setUrgencia('amarillo')}
              className={`flex-1 min-w-[110px] py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${task.urgencia === 'amarillo' ? 'bg-yellow-500/25 text-yellow-300 border-yellow-500/40' : 'bg-white/5 text-zinc-400 border-white/10 hover:border-yellow-500/40 hover:text-yellow-300'}`}
              data-testid="task-urgency-amarillo"
            >
              🟡 Apurar
            </button>
            <button
              onClick={() => setUrgencia('rojo')}
              className={`flex-1 min-w-[110px] py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${task.urgencia === 'rojo' ? 'bg-red-500/25 text-red-300 border-red-500/40 pulse-gold' : 'bg-white/5 text-zinc-400 border-white/10 hover:border-red-500/40 hover:text-red-300'}`}
              data-testid="task-urgency-rojo"
            >
              🔴 Urgente
            </button>
          </div>
        )}
        {!isAdmin && (
          <div className="mt-4 flex gap-2">
            <button onClick={() => setEstado('en_progreso')} className={`btn-ghost flex-1 !py-2 ${task.estado === 'en_progreso' ? '!bg-yellow-500/20 !text-yellow-400' : ''}`} data-testid="estado-en_progreso">En progreso</button>
            <button onClick={() => setEstado('completada')} className={`btn-ghost flex-1 !py-2 ${task.estado === 'completada' ? '!bg-green-500/20 !text-green-400' : ''}`} data-testid="estado-completada">Completada</button>
          </div>
        )}
      </div>

      <div className="card-premium flex-1 p-0 flex flex-col overflow-hidden">
        <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-3" data-testid="task-chat-messages">
          {messages.length === 0 && <p className="text-zinc-500 text-sm text-center py-10">Sin mensajes. Inicia la conversación.</p>}
          {messages.map((m) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-4 py-2 ${mine ? 'bg-gold text-obsidian' : 'bg-white/5 text-white'}`}>
                  {!mine && <p className="text-[10px] font-bold opacity-70 mb-0.5">{m.sender?.nombre}</p>}
                  <p className="text-sm whitespace-pre-wrap break-words">{m.message}</p>
                  <p className={`text-[10px] mt-1 ${mine ? 'text-obsidian/60' : 'text-zinc-500'}`}>{new Date(m.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}{mine && m.visto ? ' · visto' : ''}</p>
                </div>
              </div>
            );
          })}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-white/5 p-3 flex gap-2 bg-panel">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe un mensaje…"
            className="flex-1 bg-surface border border-white/10 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-gold/50" data-testid="chat-input" />
          <button type="submit" disabled={!text.trim() || sending} className="btn-gold !px-4 !py-2" data-testid="chat-send-button">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
