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
