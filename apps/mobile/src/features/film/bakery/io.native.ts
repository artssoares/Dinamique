import * as FileSystem from 'expo-file-system';
import type { BakedFilm, FilmIo } from './store';

/**
 * Where finished films live on a phone: the app's cache directory.
 *
 * The cache, not the documents directory, because every file here can be
 * made again from the database. The system may clear it when space runs out,
 * and the film is then simply made again the next time it is opened.
 */

const DIRECTORY = `${FileSystem.cacheDirectory ?? ''}filmes/`;

const EXTENSION: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

function extensionFor(mime: string): string {
  return EXTENSION[mime.split(';')[0]?.trim().toLowerCase() ?? ''] ?? 'mp4';
}

function mimeFor(name: string): string {
  if (name.endsWith('.webm')) return 'video/webm';
  if (name.endsWith('.mov')) return 'video/quicktime';
  return 'video/mp4';
}

/** The journey id that leads a key, `<journey>-<fingerprint>`. */
function journeyOf(key: string): string {
  const cut = key.lastIndexOf('-');
  return cut > 0 ? key.slice(0, cut) : key;
}

async function ensureDirectory(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DIRECTORY);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIRECTORY, { intermediates: true });
}

export const filmIo: FilmIo = {
  async load(key) {
    try {
      await ensureDirectory();
      const names = await FileSystem.readDirectoryAsync(DIRECTORY);
      const name = names.find((entry) => entry.startsWith(`${key}.`));
      if (!name) return null;
      return { uri: `${DIRECTORY}${name}`, mime: mimeFor(name) };
    } catch {
      return null;
    }
  },

  async save(key, base64, mime): Promise<BakedFilm> {
    await ensureDirectory();
    const type = mime.split(';')[0]?.trim().toLowerCase() || 'video/mp4';
    const uri = `${DIRECTORY}${key}.${extensionFor(type)}`;
    await FileSystem.writeAsStringAsync(uri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // An older version of the same journey's film (made before an expense
    // was added, say) will never be shown again. Twenty megabytes each.
    const journey = journeyOf(key);
    try {
      const names = await FileSystem.readDirectoryAsync(DIRECTORY);
      await Promise.all(
        names
          .filter((name) => name.startsWith(`${journey}-`) && !name.startsWith(`${key}.`))
          .map((name) => FileSystem.deleteAsync(`${DIRECTORY}${name}`, { idempotent: true })),
      );
    } catch {
      // Cleanup is housekeeping; the new file is already safe.
    }

    return { uri, mime: type };
  },
};
