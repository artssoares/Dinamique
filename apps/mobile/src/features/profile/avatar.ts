import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';

/**
 * Foto de perfil (§19).
 *
 * A imagem é reduzida e recomprimida ANTES de subir. Um motorista costuma
 * estar em rede móvel, e mandar 4 MB de foto original para exibir um círculo
 * de 44px seria desperdício de dados dele.
 */

const AVATAR_SIZE = 512;
const QUALITY = 0.7;

export interface AvatarResult {
  path: string;
  publicUrl: string;
}

export async function pickAndUploadAvatar(userId: string): Promise<AvatarResult | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  if (picked.canceled || !picked.assets[0]) return null;

  const compressed = await ImageManipulator.manipulateAsync(
    picked.assets[0].uri,
    [{ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } }],
    { compress: QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );

  const response = await fetch(compressed.uri);
  const bytes = await response.arrayBuffer();

  // O caminho precisa começar com o id do usuário – é assim que a política do
  // Storage sabe que a pasta é dele. O timestamp evita cache velho.
  const path = `${userId}/avatar-${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) return null;

  await removeOldAvatars(userId, path);

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);

  return { path, publicUrl: data.publicUrl };
}

/** Sem isso, cada troca de foto deixaria um arquivo órfão no Storage. */
async function removeOldAvatars(userId: string, keepPath: string): Promise<void> {
  const { data } = await supabase.storage.from('avatars').list(userId);
  const stale = (data ?? [])
    .map((file) => `${userId}/${file.name}`)
    .filter((path) => path !== keepPath);
  if (stale.length > 0) {
    await supabase.storage.from('avatars').remove(stale);
  }
}

export async function removeAvatar(userId: string): Promise<void> {
  const { data } = await supabase.storage.from('avatars').list(userId);
  const paths = (data ?? []).map((file) => `${userId}/${file.name}`);
  if (paths.length > 0) {
    await supabase.storage.from('avatars').remove(paths);
  }
  await supabase.from('profiles').update({ avatar_path: null }).eq('id', userId);
}

export function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
