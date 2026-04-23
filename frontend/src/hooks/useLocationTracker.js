import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Continuously track the staff's position while the app is active and
// upsert the latest coordinates into public.live_positions — ONLY if the
// user has enabled background sharing (stored in localStorage).
export function useLocationTracker({ intervalMs = 15000 } = {}) {
  const { user, profile } = useAuth();
  const watchRef = useRef(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!user || profile?.rol !== 'personal') return;
    if (!('geolocation' in navigator)) return;

    const enabled = localStorage.getItem('alfatwin_share_location') === 'yes';
    if (!enabled) return;

    async function push(lat, lng, acc, heading, speed) {
      const now = Date.now();
      if (now - lastSentRef.current < intervalMs) return;
      lastSentRef.current = now;
      try {
        await supabase.from('live_positions').upsert({
          user_id: user.id,
          latitud: lat,
          longitud: lng,
          precision_m: acc ?? null,
          heading: heading ?? null,
          speed: speed ?? null,
          updated_at: new Date().toISOString(),
        });
      } catch (e) { /* silent */ }
    }

    function onUpdate(pos) {
      const { latitude, longitude, accuracy, heading, speed } = pos.coords;
      push(latitude, longitude, accuracy, heading, speed);
    }
    function onError() { /* ignore transient errors */ }

    watchRef.current = navigator.geolocation.watchPosition(onUpdate, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });

    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    };
  }, [user, profile?.rol, intervalMs]);
}

export function getLocationSharingEnabled() {
  return localStorage.getItem('alfatwin_share_location') === 'yes';
}
export function setLocationSharingEnabled(enabled) {
  localStorage.setItem('alfatwin_share_location', enabled ? 'yes' : 'no');
}
export function hasAnsweredLocationSharing() {
  const v = localStorage.getItem('alfatwin_share_location');
  return v === 'yes' || v === 'no';
}
