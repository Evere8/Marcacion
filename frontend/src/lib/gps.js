// Anti-fake-GPS detection — conservative heuristics usable from the browser.
// Returns { fake: boolean, reasons: string[] }.

export async function detectFakeGPS(position) {
  const reasons = [];
  if (!position || !position.coords) {
    reasons.push('Sin datos de posición');
    return { fake: true, reasons };
  }
  const { accuracy, latitude, longitude, altitude, speed } = position.coords;

  // 1. Unrealistically perfect accuracy is suspicious.
  if (accuracy != null && accuracy < 1) reasons.push('Precisión sospechosamente perfecta');

  // 2. Very poor accuracy → probably IP geolocation, not real GPS.
  if (accuracy != null && accuracy > 150) reasons.push(`Precisión insuficiente (${Math.round(accuracy)} m)`);

  // 3. Coordinates at (0,0) are the classic emulator default.
  if (latitude === 0 && longitude === 0) reasons.push('Coordenadas (0,0) típicas de emulador');

  // 4. Exact integer lat/lng is typical of mock providers.
  if (Number.isInteger(latitude) && Number.isInteger(longitude)) reasons.push('Coordenadas enteras (mock)');

  // 5. altitude/speed are NaN on nearly every mock provider.
  if (altitude === null && speed === null && accuracy != null && accuracy < 5) {
    reasons.push('Sin altitud/velocidad pero precisión extrema');
  }

  // 6. Sample 2 reads — if the chip keeps returning the exact same lat/lng/accuracy,
  //    that's a strong mock-location signal on a moving device.
  try {
    const second = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 })
    );
    if (
      second.coords.latitude === latitude &&
      second.coords.longitude === longitude &&
      second.coords.accuracy === accuracy
    ) {
      reasons.push('Lecturas GPS idénticas (mock)');
    }
  } catch (_) { /* ignore */ }

  // 7. Detect common user-agent signals of dev tooling.
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('headlesschrome') || ua.includes('phantomjs')) {
    reasons.push('User agent sospechoso (headless)');
  }

  return { fake: reasons.length > 0 && reasons.some(r => !r.startsWith('Precisión insuficiente')), reasons };
}

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
