import { useSystemConfig } from '../contexts/SystemConfigContext';

export default function Logo({ size = 48, withText = false, className = '' }) {
  const { config } = useSystemConfig();
  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid="brand-logo">
      <div
        className="rounded-xl overflow-hidden grid place-items-center flex-shrink-0"
        style={{ width: size, height: size, background: '#050505' }}
      >
        <img
          src={config.logo}
          alt={config.nombre_sistema}
          className="w-full h-full object-contain"
          style={{ padding: size >= 72 ? 2 : 0 }}
        />
      </div>
      {withText && (
        <div className="leading-tight">
          <div className="font-black tracking-tight text-white text-xl silver-gradient-text">{config.nombre_sistema}</div>
          <div className="text-[10px] uppercase tracking-[0.25em] gold-gradient-text font-bold">{config.tagline}</div>
        </div>
      )}
    </div>
  );
}
