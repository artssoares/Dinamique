import type { BakedFilm, FilmIo } from './store';

/**
 * Where finished films live in a browser: Cache Storage.
 *
 * The app ships on the web, and a film made yesterday should not be made
 * again because the tab was closed. Cache Storage holds a twenty megabyte
 * file without complaint where localStorage would refuse it, and like the
 * phone's cache directory it may be cleared by the browser, after which the
 * film is simply made again.
 *
 * This is also the module TypeScript resolves everywhere; the phone uses
 * `io.native.ts`.
 */

const CACHE = 'dinamique-filmes-v1';
/** Never fetched: Cache Storage only needs a URL to file the entry under. */
const PREFIX = '/__filmes/';

function journeyOf(key: string): string {
  const cut = key.lastIndexOf('-');
  return cut > 0 ? key.slice(0, cut) : key;
}

/**
 * base64 to bytes, in slices. `atob` over twenty megabytes at once is a stall
 * the driver can feel; the pieces are aligned to three bytes at the source,
 * which is what makes slicing legal.
 */
function bytesFrom(base64: string): Uint8Array {
  const SLICE = 1_398_100 - (1_398_100 % 4);
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let start = 0; start < base64.length; start += SLICE) {
    const binary = globalThis.atob(base64.slice(start, start + SLICE));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    parts.push(bytes);
    total += bytes.length;
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    all.set(part, offset);
    offset += part.length;
  }
  return all;
}

function fileName(key: string, mime: string): string {
  const extension = mime.includes('webm') ? 'webm' : 'mp4';
  return `dinamique-jornada-${journeyOf(key).slice(0, 8)}.${extension}`;
}

function toBaked(key: string, blob: Blob, mime: string): BakedFilm {
  const file = new File([blob], fileName(key, mime), { type: mime });
  return { uri: URL.createObjectURL(file), mime, file };
}

async function openCache(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null;
    return await caches.open(CACHE);
  } catch {
    // Private windows and some embedded browsers refuse Cache Storage. The
    // film still plays and shares; it is made again next time.
    return null;
  }
}

export const filmIo: FilmIo = {
  async load(key) {
    const cache = await openCache();
    if (!cache) return null;
    try {
      const hit = await cache.match(`${PREFIX}${key}`);
      if (!hit) return null;
      const blob = await hit.blob();
      if (blob.size === 0) return null;
      const mime = blob.type || 'video/mp4';
      return toBaked(key, blob, mime);
    } catch {
      return null;
    }
  },

  async save(key, base64, mime) {
    const type = mime.split(';')[0]?.trim().toLowerCase() || 'video/mp4';
    const bytes = bytesFrom(base64);
    if (bytes.length === 0) throw new Error('empty');
    // `bytes.buffer` rather than the view: the DOM types in this toolchain do
    // not take a Uint8Array as a BlobPart, and it is the same memory.
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type });

    const cache = await openCache();
    if (cache) {
      try {
        const journey = journeyOf(key);
        for (const request of await cache.keys()) {
          const path = new URL(request.url).pathname;
          if (path.startsWith(`${PREFIX}${journey}-`) && path !== `${PREFIX}${key}`) {
            await cache.delete(request);
          }
        }
        await cache.put(
          `${PREFIX}${key}`,
          new Response(blob, { headers: { 'content-type': type } }),
        );
      } catch {
        // Out of quota, most likely. The film in hand is unaffected.
      }
    }

    return toBaked(key, blob, type);
  },
};
