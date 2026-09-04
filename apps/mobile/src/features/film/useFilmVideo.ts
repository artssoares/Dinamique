import { useCallback, useRef, useState } from 'react';
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
 * Between the page and React Native there is no shared memory, so the file
 * crosses as base64 in pieces. The pieces are aligned to three bytes at the
 * source, which makes them concatenable without decoding; decoding happens
 * once, when the file is written.
 */

export type VideoPhase =
  | 'idle'
  | 'preparing'
  | 'rendering'
  | 'encoding'
  | 'sharing'
  | 'done'
  | 'error';

export interface FilmVideoState {
  phase: VideoPhase;
  /** 0 to 1 within the current phase. */
  progress: number;
  error: string | null;
  busy: boolean;
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

export function useFilmVideo(options: { journeyId: string; hasRoute: boolean }): FilmVideoState & {
  /** Hand this to the stage's `onMessage`. */
  handleMessage: (message: RecapMessage) => void;
  begin: () => void;
  reset: () => void;
} {
  const [phase, setPhase] = useState<VideoPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // The pieces live in a ref, not in state: they are thousands of kilobytes
  // and every `setState` would redraw the whole screen mid-recording.
  const chunks = useRef<string[]>([]);

  const reset = useCallback(() => {
    chunks.current = [];
    setPhase('idle');
    setProgress(0);
    setError(null);
  }, []);

  const begin = useCallback(() => {
    chunks.current = [];
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

  const finish = useCallback(
    async (payload: { base64: string; mimeType: string; url?: string }) => {
      setPhase('sharing');
      setProgress(1);

      try {
        const fileName = `dinamique-jornada-${options.journeyId.slice(0, 8)}.${extensionFor(
          payload.mimeType,
        )}`;

        if (Platform.OS === 'web') {
          // No native share sheet in a browser: it downloads, like the
          // spreadsheet export does.
          const link = document.createElement('a');
          link.href = payload.url ?? '';
          link.download = fileName;
          link.click();
          if (payload.url) setTimeout(() => URL.revokeObjectURL(payload.url!), 60_000);
        } else {
          const uri = `${FileSystem.cacheDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(uri, payload.base64, {
            encoding: FileSystem.EncodingType.Base64,
          });

          if (!(await Sharing.isAvailableAsync())) {
            fail('Compartilhamento não disponível neste aparelho.', 'no-share-sheet');
            return;
          }

          await Sharing.shareAsync(uri, {
            mimeType: payload.mimeType,
            dialogTitle: 'Compartilhar jornada',
            // Without the UTI, iOS treats the file as generic and some menu
            // options (Stories, for one) simply do not appear.
            UTI: 'public.movie',
          });
        }

        setPhase('done');
        void track('journey_film_shared', {
          journey_id: options.journeyId,
          has_route: options.hasRoute,
          mime: payload.mimeType,
        });
      } catch {
        fail('Não foi possível salvar o vídeo.', 'write');
      }
    },
    [fail, options.hasRoute, options.journeyId],
  );

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
            void finish({ base64: '', mimeType: message.mime, url: message.url });
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
          void finish({ base64: chunks.current.join(''), mimeType: message.mime });
          break;
        }

        case 'error':
          fail(message.message, message.code);
          break;

        default:
          break;
      }
    },
    [fail, finish],
  );

  return {
    phase,
    progress,
    error,
    busy: phase === 'preparing' || phase === 'rendering' || phase === 'encoding' || phase === 'sharing',
    handleMessage,
    begin,
    reset,
  };
}
