import { Copy, CheckCircle2, ExternalLink, Database } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';
import { toast } from 'sonner';

const STEPS = [
  { n: '01_schema.sql', label: 'Crear tablas y triggers' },
  { n: '02_rls.sql', label: 'Políticas de seguridad' },
  { n: '03_storage.sql', label: 'Buckets de almacenamiento' },
  { n: '04_seed.sql', label: 'Datos iniciales + admin' },
];

export default function SetupRequired() {
  const { signOut } = useAuth();
  const [copied, setCopied] = useState(null);
  async function copy(name) {
    try {
      const r = await fetch(`/supabase/${name}`);
      const t = await r.text();
      await navigator.clipboard.writeText(t);
      setCopied(name); setTimeout(() => setCopied(null), 1800);
      toast.success(`${name} copiado`);
    } catch {
      toast.error('Descarga manual requerida desde /app/supabase');
    }
  }
  return (
    <div className="min-h-screen grid place-items-center px-5 py-10">
      <div className="max-w-2xl w-full">
        <div className="flex justify-center mb-8"><Logo size={72} withText /></div>
        <div className="card-premium p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gold/15 text-gold grid place-items-center"><Database className="w-4 h-4" /></div>
            <div>
              <p className="label-eyebrow">Configuración inicial</p>
              <h1 className="text-2xl font-black tracking-tight">Base de datos pendiente</h1>
            </div>
          </div>
          <p className="text-sm text-zinc-400 font-light">
            Tu cuenta de autenticación existe pero las tablas de Supabase todavía no están creadas. Ejecuta los 4 scripts SQL en tu dashboard de Supabase para activar el sistema.
          </p>

          <ol className="mt-6 space-y-2">
            {STEPS.map((s, i) => (
              <li key={s.n} className="flex items-center gap-3 p-3 rounded-xl bg-panel border border-white/5">
                <span className="w-7 h-7 rounded-full bg-gold/15 text-gold grid place-items-center text-xs font-black">{i + 1}</span>
                <div className="flex-1 min-w-0"><p className="font-bold text-sm">{s.n}</p><p className="text-xs text-zinc-500">{s.label}</p></div>
                <a href={`/supabase/${s.n}`} target="_blank" rel="noreferrer" className="btn-ghost !px-3 !py-1.5 text-xs">Ver</a>
              </li>
            ))}
          </ol>

          <div className="mt-6 p-4 rounded-xl bg-gold/5 border border-gold/20 text-sm">
            <p className="font-bold text-gold mb-1">Cómo ejecutar:</p>
            <ol className="list-decimal list-inside text-zinc-400 space-y-1 text-xs">
              <li>Abre tu proyecto Supabase → <strong>SQL Editor</strong> → New Query.</li>
              <li>Abre <code className="text-gold">/app/supabase/01_schema.sql</code>, copia todo, pega y ejecuta.</li>
              <li>Repite con <code className="text-gold">02_rls.sql</code>, <code className="text-gold">03_storage.sql</code>, <code className="text-gold">04_seed.sql</code>.</li>
              <li>Recarga esta página.</li>
            </ol>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-2">
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="btn-gold flex items-center justify-center gap-2" data-testid="open-supabase">
              <ExternalLink className="w-4 h-4" /> Abrir Supabase
            </a>
            <button onClick={() => window.location.reload()} className="btn-ghost">Ya lo ejecuté · Recargar</button>
            <button onClick={signOut} className="btn-ghost">Cerrar sesión</button>
          </div>
        </div>
      </div>
    </div>
  );
}
