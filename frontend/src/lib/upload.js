import imageCompression from 'browser-image-compression';
import { supabase } from './supabase';

export async function compressImage(file, maxMB = 0.4) {
  return imageCompression(file, {
    maxSizeMB: maxMB,
    maxWidthOrHeight: 800,
    useWebWorker: true,
    fileType: 'image/webp',
  });
}

export async function uploadAvatar(userId, file) {
  const compressed = await compressImage(file, 0.3);
  const path = `${userId}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from('avatars').upload(path, compressed, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadSystemAsset(file, name = 'logo') {
  const compressed = await compressImage(file, 0.5);
  const path = `${name}-${Date.now()}.webp`;
  const { error } = await supabase.storage.from('system').upload(path, compressed, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('system').getPublicUrl(path);
  return data.publicUrl;
}

// Upload a mark photo. Compresses to ~150KB max @ 1024px to keep storage usage low.
export async function uploadMarkPhoto(userId, markId, file) {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.15,
    maxWidthOrHeight: 1024,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 0.7,
  });
  const path = `${userId}/${markId}-${Date.now()}.webp`;
  const { error } = await supabase.storage.from('mark-photos').upload(path, compressed, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('mark-photos').getPublicUrl(path);
  return { url: data.publicUrl, path };
}

// Delete a mark photo by URL (best-effort).
export async function deleteMarkPhoto(url) {
  if (!url) return;
  try {
    const u = new URL(url);
    const idx = u.pathname.indexOf('/mark-photos/');
    if (idx < 0) return;
    const path = decodeURIComponent(u.pathname.slice(idx + '/mark-photos/'.length));
    await supabase.storage.from('mark-photos').remove([path]);
  } catch {}
}
