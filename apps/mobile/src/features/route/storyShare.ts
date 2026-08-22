import { Platform } from 'react-native';
import type Svg from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { STORY_HEIGHT, STORY_WIDTH } from '@dinamique/ui';

/** A capture that never calls back must not freeze the button forever. */
const CAPTURE_TIMEOUT_MS = 8_000;

export interface ShareResult {
  ok: boolean;
  /** Something to show the driver. Never a stack trace, never silence. */
  reason?: string;
}

/**
 * Turns the mounted card into a PNG, at story size.
 *
 * `toDataURL` on the SVG node, not a view-shot library. react-native-svg is
 * already a dependency — every icon in the app goes through it — so the whole
 * share path costs zero new native modules, which on a project that has never
 * produced a native build is worth more than the convenience of a wrapper.
 *
 * The size is passed explicitly rather than inherited from the layout: the
 * card is mounted off-screen at whatever the renderer gives it, and a story
 * exported at the phone's width would post as a blurry rectangle.
 */
export function captureStory(node: Svg | null): Promise<string | null> {
  if (!node) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // On the web the capture goes through an <img> load, which simply never
    // fires if the browser refuses the serialised SVG. Without this the
    // spinner would spin for the rest of the session.
    const timer = setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);

    try {
      node.toDataURL(
        (base64: string) => {
          clearTimeout(timer);
          finish(base64 || null);
        },
        { width: STORY_WIDTH, height: STORY_HEIGHT },
      );
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/**
 * Hands the image to the driver: the share sheet on a phone, a download on the
 * web. The same shape as `features/export/share.ts`, deliberately — there is
 * one way this app gives somebody a file.
 */
export async function deliverStory(base64: string, fileName: string): Promise<ShareResult> {
  if (Platform.OS === 'web') return downloadOnWeb(base64, fileName);

  const uri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  if (!(await Sharing.isAvailableAsync())) {
    return { ok: false, reason: 'Compartilhamento não disponível neste aparelho.' };
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    dialogTitle: 'Compartilhar seu trajeto',
    // The Instagram story flow reads a UTI on iOS; without it the sheet offers
    // "save to Files" and little else.
    UTI: 'public.png',
  });
  return { ok: true };
}

function downloadOnWeb(base64: string, fileName: string): ShareResult {
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  return { ok: true };
}
