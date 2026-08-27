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
 *
 * The web takes its own path — see `captureOnWeb`.
 */
export function captureStory(node: Svg | null, host?: unknown): Promise<string | null> {
  if (Platform.OS === 'web') return captureOnWeb(host);
  if (!node) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

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
 * The same picture, drawn by hand, because the library's web `toDataURL`
 * cannot produce it here.
 *
 * That implementation builds its output frame from `getBoundingClientRect()`
 * of the node. The card is mounted at its real 1080×1920 and shrunk to the
 * preview by a CSS transform — and a transformed element measures as what you
 * see, 250 across, not as what it is. So the export asked for a 1080×1920
 * canvas while telling the renderer the drawing was 250×444: the card came out
 * blown up four times, cropped to its own top-left corner. That is the
 * "compartilhou e saiu zoado".
 *
 * Serialising the node ourselves and stating the frame outright is both the
 * fix and one fewer thing taken on faith. Base64 rather than a raw `utf8`
 * data URI, too: the card carries "sábado", "março" and "R$", and browsers
 * disagree about unescaped bytes in a data URL.
 */
function captureOnWeb(host: unknown): Promise<string | null> {
  const node = findSvg(host);
  if (!node) return Promise.resolve(null);

  const clone = node.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(STORY_WIDTH));
  clone.setAttribute('height', String(STORY_HEIGHT));
  clone.setAttribute('viewBox', `0 0 ${STORY_WIDTH} ${STORY_HEIGHT}`);

  const source = `data:image/svg+xml;base64,${toBase64(
    new XMLSerializer().serializeToString(clone),
  )}`;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // A decode that never resolves would leave the button spinning for the
    // rest of the session.
    const timer = setTimeout(() => finish(null), CAPTURE_TIMEOUT_MS);

    const image = new Image();
    image.onerror = () => {
      clearTimeout(timer);
      finish(null);
    };
    image.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = STORY_WIDTH;
        canvas.height = STORY_HEIGHT;
        const context = canvas.getContext('2d');
        if (!context) return finish(null);
        context.drawImage(image, 0, 0, STORY_WIDTH, STORY_HEIGHT);
        finish(canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '') || null);
      } catch {
        finish(null);
      }
    };
    image.src = source;
  });
}

/** The hook hands over the wrapper; on the web that is a DOM node. */
function findSvg(host: unknown): SVGSVGElement | null {
  const element = host as Element | null;
  if (!element || typeof element.querySelector !== 'function') return null;
  if (element.tagName?.toLowerCase() === 'svg') return element as unknown as SVGSVGElement;
  return element.querySelector('svg');
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return globalThis.btoa(binary);
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
