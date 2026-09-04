import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { parseRecapMessage } from '@dinamique/recap';
import { darkTokens } from '@dinamique/ui';
import type { FilmStageHandle, FilmStageProps } from './FilmStageShared';

/**
 * The film on a phone: the same self-contained document, in a WebView.
 *
 * See `FilmStage.tsx` for why the document is shared and why this file is the
 * platform-specific one. The recording crosses back as base64 in chunks,
 * because there is no shared memory between a WebView and React Native.
 */
export const FilmStage = forwardRef<FilmStageHandle, FilmStageProps>(function FilmStage(
  { recap, onMessage, mode = 'preview', style },
  ref,
) {
  const webRef = useRef<WebView>(null);

  const html = useMemo(
    () =>
      recap.document({
        loop: mode === 'preview',
        autoplay: mode === 'preview',
        deliver: 'chunks',
      }),
    [recap, mode],
  );

  function run(script: string): void {
    webRef.current?.injectJavaScript(`${script} true;`);
  }

  useImperativeHandle(
    ref,
    () => ({
      play: () => run('window.recap && window.recap.play();'),
      pause: () => run('window.recap && window.recap.pause();'),
      seek: (index: number) => run(`window.recap && window.recap.seek(${Number(index)});`),
      record: () => run('window.recap && window.recap.record();'),
    }),
    [],
  );

  return (
    <View style={[styles.stage, style]}>
      <WebView
        ref={webRef}
        source={{ html }}
        originWhitelist={['*']}
        style={styles.web}
        containerStyle={styles.web}
        javaScriptEnabled
        domStorageEnabled
        // The film plays by itself and has no audio; requiring a tap to start
        // would leave the preview stuck on a black frame.
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        // Nothing here scrolls, and the iOS bounce peels the video off its frame.
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        onMessage={(event) => {
          const message = parseRecapMessage(event.nativeEvent.data);
          if (message) onMessage?.(message);
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden', backgroundColor: darkTokens.backgroundPrimary },
  web: { flex: 1, backgroundColor: darkTokens.backgroundPrimary },
});

export type { FilmStageHandle, FilmStageProps };
