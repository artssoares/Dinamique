import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { RecapMessage } from '@dinamique/recap';
import { track } from '@/lib/analytics';

/**
 * From the canvas to the share sheet.
 *
 * The video is generated on the device. Nothing about the route goes to a
 * rendering server, ours included: the data is already in Supabase, where it
 * came from, and passes through nowhere else. The same promise the
 * spreadsheet export makes.
 *
 * On a phone the file goes to the system share sheet, which is where
 * Instagram, WhatsApp and the rest live. In a browser that sheet exists too
 * (the Web Share API), but it opens only from a tap, and the recording ends
 * twenty seconds after the last one. So the browser records, then waits with
 * the file ready and asks for one more tap: that tap opens the sheet. A
 * download is what happens only where the sheet does not exist, a desktop
 * browser mostly.
 *
 * Between a WebView and React Native there is no shared memory, so there the
 * file crosses as base64 in pieces. The pieces are aligned to three bytes at
 * the source, which makes them concatenable without decoding; decoding
 * happens once, when the file is written.
 */

export type VideoPhase =
  | 'idle'
  | 'preparing'
  | 'rendering'
  | 'encoding'
  /** Browser only: the file is made and waits for the tap that shares it. */
  | 'ready'
  | 'sharing'
  | 'done'
  | 'error';

export interface FilmVideoState {
  phase: VideoPhase;
  /** 0 to 1 within the current phase. */
  progress: number;
  error: string | null;
  busy: boolean;
  /** Browser only: whether the tap in `ready` opens a share sheet or saves a file. */
  canShareSheet: boolean;
}

const MIME_EXTENSION: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

function extensionFor(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return MIME_EXTENSION[base] ?? 'mp4';
}

function baseMime(mime: string): string {
  return mime.split(';')[0]?.trim().toLowerCase() || 'video/mp4';
}

interface ReadyFile {
  file: File;
  url: string;
}

/** Whether this browser can hand a video file to the system share sheet. */
function sheetAvailable(file: File): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function useFilmVideo(options: { journeyId: string; hasRoute: boolean }): FilmVideoState & {
  /** Hand this to the stage's `onMessage`. */
  handleMessage: (message: RecapMessage) => void;
  begin: () => void;
  /** Browser only, in `ready`: opens the share sheet, or saves the file where there is none. */
  share: () => void;
  reset: () => void;
} {
  const [phase, setPhase] = useState<VideoPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<ReadyFile | null>(null);

  // The pieces live in a ref, not in state: they are thousands of kilobytes
  // and every `setState` would redraw the whole screen mid-recording.
  const chunks = useRef<string[]>([]);

  // The object URL is memory until it is revoked. Released when a new file
  // replaces it and when the player goes away.
  useEffect(() => {
    return () => {
      if (ready?.url) URL.revokeObjectURL(ready.url);
    };
  }, [ready]);

  const reset = useCallback(() => {
    chunks.current = [];
    setReady(null);
    setPhase('idle');
    setProgress(0);
    setError(null);
  }, []);

  const begin = useCallback(() => {
    chunks.current = [];
    setReady(null);
    setError(null);
    setProgress(0);
    setPhase('preparing');
  }, []);

  const fail = useCallback(
    (message: string, code: string) => {
      chunks.current = [];
      setError(message);
      setPhase('error');
      void track('journey_film_failed', { code, journey_id: options.journeyId });
    },
    [options.journeyId],
  );

  const fileName = useCallback(
    (mime: string) => `dinamique-jornada-${options.journeyId.slice(0, 8)}.${extensionFor(mime)}`,
    [options.journeyId],
  );

  const shared = useCallback(
    (mime: string, how: 'sheet' | 'download') => {
      setPhase('done');
      void track('journey_film_shared', {
        journey_id: options.journeyId,
        has_route: options.hasRoute,
        mime,
        how,
      });
    },
    [options.hasRoute, options.journeyId],
  );

  /** Native: write the file and open the sheet. No second tap is needed there. */
  const finishNative = useCallback(
    async (base64: string, mimeType: string) => {
      setPhase('sharing');
      setProgress(1);
      try {
        const uri = `${FileSystem.cacheDirectory}${fileName(mimeType)}`;
        await FileSystem.writeAsStringAsync(uri, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });

        if (!(await Sharing.isAvailableAsync())) {
          fail('Compartilhamento não disponível neste aparelho.', 'no-share-sheet');
          return;
        }

        await Sharing.shareAsync(uri, {
          mimeType,
          dialogTitle: 'Compartilhar jornada',
          // Without the UTI, iOS treats the file as generic and some menu
          // options (Stories, for one) simply do not appear.
          UTI: 'public.movie',
        });
        shared(mimeType, 'sheet');
      } catch {
        fail('Não foi possível salvar o vídeo.', 'write');
      }
    },
    [fail, fileName, shared],
  );

  /** Browser: fetch the blob the document made and hold it for the next tap. */
  const finishWeb = useCallback(
    async (url: string, mimeType: string) => {
      try {
        const blob = await fetch(url).then((response) => response.blob());
        const type = baseMime(blob.type || mimeType);
        const file = new File([blob], fileName(type), { type });
        setReady({ file, url });
        setProgress(1);
        setPhase('ready');
      } catch {
        fail('Não foi possível ler o vídeo gerado.', 'read');
      }
    },
    [fail, fileName],
  );

  /**
   * Must run inside the tap, with nothing awaited before `navigator.share`:
   * iOS counts the gesture as spent the moment the handler yields, and then
   * refuses the sheet with NotAllowedError. That is why the call below is
   * not awaited before it is made, and why the button that triggers it on
   * the web is a plain DOM button rather than a Pressable.
   */
  const share = useCallback(() => {
    if (!ready) return;
    const { file, url } = ready;

    const download = () => {
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      shared(file.type, 'download');
    };

    if (!sheetAvailable(file)) {
      download();
      return;
    }

    setPhase('sharing');
    navigator
      .share({ files: [file], title: 'Meu dia no Dinamique' })
      .then(() => shared(file.type, 'sheet'))
      .catch((error: unknown) => {
        const name = (error as { name?: string })?.name ?? 'Error';
        // The driver closed the sheet without picking anything. Nothing went
        // wrong, and the file is still here for another try.
        if (name === 'AbortError') {
          setPhase('ready');
          return;
        }
        // Anything else is said out loud, with the reason, and the file is
        // saved so twenty seconds of recording are never lost. Silent
        // fallbacks are how "nothing happens" reports get written.
        void track('journey_film_failed', { code: `share-${name}`, journey_id: options.journeyId });
        setError(`A tela de compartilhar não abriu (${name}). O vídeo foi salvo no aparelho.`);
        download();
      });
  }, [options.journeyId, ready, shared]);

  const handleMessage = useCallback(
    (message: RecapMessage) => {
      switch (message.type) {
        case 'progress':
          // Fetching tiles is preparation; painting frames is the recording
          // itself. Kept apart because the first depends on the network and
          // the second does not, and a driver on a poor signal deserves to
          // know which one is slow.
          setPhase(message.phase === 'tiles' ? 'preparing' : 'rendering');
          setProgress(message.value);
          break;

        case 'begin':
          chunks.current = [];
          setPhase('encoding');
          setProgress(0);
          break;

        case 'chunk':
          chunks.current[message.index] = message.data;
          setProgress((message.index + 1) / message.total);
          break;

        case 'done': {
          if (message.url) {
            void finishWeb(message.url, message.mime);
            return;
          }
          const expected = message.chunks ?? chunks.current.length;
          const received = chunks.current.filter((chunk) => typeof chunk === 'string').length;
          if (received < expected) {
            // A missing piece produces a file that opens and shows garbage.
            // Better to fail here, where it can be explained and retried.
            fail('A transferência do vídeo ficou incompleta. Tente de novo.', 'incomplete');
            return;
          }
          void finishNative(chunks.current.join(''), message.mime);
          break;
        }

        case 'error':
          fail(message.message, message.code);
          break;

        default:
          break;
      }
    },
    [fail, finishNative, finishWeb],
  );

  return {
    phase,
    progress,
    error,
    busy:
      phase === 'preparing' || phase === 'rendering' || phase === 'encoding' || phase === 'sharing',
    canShareSheet: Platform.OS !== 'web' || (ready !== null && sheetAvailable(ready.file)),
    handleMessage,
    begin,
    share,
    reset,
  };
}
