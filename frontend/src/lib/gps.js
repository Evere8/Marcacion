// Simple, reliable geolocation helpers (fake-GPS detection removed).

export function getDeviceInfo() {
  const n = navigator;
  return [n.platform, n.userAgent?.split(') ')[0]?.split('(')[1] || n.userAgent].filter(Boolean).join(' · ');
}

export async function reverseGeocode(lat, lon) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18`,
      { headers: { 'Accept-Language': 'es' } }
    );
    const j = await r.json();
    return j.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

export function getHighAccuracyPosition(opts = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocalización no disponible'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: opts.timeout ?? 15000,
      maximumAge: 0,
    });
  });
}

// Returns an object URL you can use to open native maps on mobile or Google Maps on desktop.
export function mapsUrl(lat, lng) {
  if (lat == null || lng == null) return null;
  // Universal URL: native apps on iOS/Android will catch it, desktop opens Google Maps.
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

// Request persistent location permission (best-effort; browsers handle UI).
export async function ensureLocationPermission() {
  if (!('geolocation' in navigator)) return 'unsupported';
  try {
    if (navigator.permissions?.query) {
      const p = await navigator.permissions.query({ name: 'geolocation' });
      if (p.state === 'granted') return 'granted';
    }
  } catch {}
  // Trigger a one-off high-accuracy request so the browser shows the prompt.
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => resolve(err.code === 1 ? 'denied' : 'prompt'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}
