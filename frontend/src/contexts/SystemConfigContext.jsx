import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const SysCtx = createContext(null);

const DEFAULTS = {
  nombre_sistema: 'ALFATWIN',
  color_primary: '#D4AF37',
  color_secondary: '#E2E8F0',
  tagline: 'Conectamos Talento · Generamos Soluciones',
  logo: 'https://customer-assets.emergentagent.com/job_890d0b19-1210-4f2a-9296-3f25eb035cc7/artifacts/j6jbc1x8_WhatsApp%20Image%202026-04-19%20at%2018.27.56.jpeg',
};

export function SystemConfigProvider({ children }) {
  const [config, setConfig] = useState(DEFAULTS);

  async function load() {
    const { data } = await supabase.from('system_config').select('*').limit(1).maybeSingle();
    if (data) setConfig({ ...DEFAULTS, ...data });
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel('system_config_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'system_config' }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--brand-gold', config.color_primary);
    document.documentElement.style.setProperty('--brand-silver', config.color_secondary);
    document.title = config.nombre_sistema;
  }, [config]);

  return <SysCtx.Provider value={{ config, refresh: load }}>{children}</SysCtx.Provider>;
}

export const useSystemConfig = () => useContext(SysCtx);
