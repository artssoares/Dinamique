import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { parseRecapMessage, type RecapMessage } from '@dinamique/recap';
import { darkTokens } from '@dinamique/ui';
import type { FilmStageHandle, FilmStageProps } from './FilmStageShared';

/**
 * The film on the web, and the module TypeScript resolves everywhere.
 *
 * Metro prefers `FilmStage.native.tsx` on a device; the compiler knows nothing
 * about platform extensions, so the bare file has to be a real module it can
 * typecheck. Making that file the web one keeps `react-native-webview` out of
 * the web dependency graph structurally.
 *
 * The document is the same object on both platforms: the page that becomes
 * the video is the page the driver watches. That is not code economy, it is
 * the only way the preview is an honest promise of the file that will leave.
 *
 * Here it goes into an iframe by `srcDoc`. An iframe is not a React Native
 * component, so it is created with `createElement` directly: react-native-web
 * passes unknown DOM elements through, and this is the one place the two
 * platforms genuinely differ.
 */
export const FilmStage = forwardRef<FilmStageHandle, FilmStageProps>(function FilmStage(
  { recap, onMessage, mode = 'preview', fit = 'contain', style },
  ref,
) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  const html = useMemo(
    () =>
      recap.document({
        loop: mode === 'preview',
        autoplay: mode === 'preview',
        deliver: 'objectUrl',
        fit,
      }),
    [recap, mode, fit],
  );

  function player(): FilmWindow | null {
    const win = frameRef.current?.contentWindow as FilmWindow | null | undefined;
    return win?.recap ? win : null;
  }

  useImperativeHandle(
    ref,
    () => ({
      play: () => player()?.recap?.play(),
      pause: () => player()?.recap?.pause(),
      seek: (index: number) => player()?.recap?.seek(index),
      record: () => player()?.recap?.record(),
    }),
    [],
  );

  // Messages from the document arrive through `window.postMessage`, and two
  // stages can be mounted at once (the preview and the export). Only the
  // frame this stage owns is listened to.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const listener = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      if (frameRef.current && event.source !== frameRef.current.contentWindow) return;
      const message = parseRecapMessage(event.data);
      if (message) handler.current?.(message);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return (
    <View style={[{ flex: 1, overflow: 'hidden', backgroundColor: darkTokens.backgroundPrimary }, style]}>
      {createElement('iframe', {
        ref: frameRef,
        srcDoc: html,
        title: 'Filme da jornada',
        style: {
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: darkTokens.backgroundPrimary,
        },
        // No origin sandbox: the document is generated here and needs to be
        // same-origin for its canvas to be captured.
        allow: 'autoplay',
      })}
    </View>
  );
});

interface FilmWindow extends Window {
  recap?: {
    play: () => void;
    pause: () => void;
    seek: (index: number) => void;
    record: () => void;
  };
}

export type { FilmStageHandle, FilmStageProps, RecapMessage };
