import {
  createElement,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recap, RecapMessage } from '@dinamique/recap';
import { Button, darkTokens, Icon, IconButton, Text, useTheme } from '@dinamique/ui';
import { FilmStage, type FilmStageHandle } from './FilmStage';
import { useFilmVideo, type VideoPhase } from './useFilmVideo';

/**
 * The film, full screen, with the one thing a driver does with it: share it.
 *
 * Used by the full-screen route and by the day screen when the square grows.
 * Recording swaps the playing stage for a second one at file resolution. It
 * stays visible on purpose: a hidden page has its `requestAnimationFrame`
 * throttled to a frame a second, and the video would come out that way.
 * Watching it record is also the honest answer to "what is it doing with my
 * phone for twenty seconds".
 *
 * In a browser the share sheet opens only from a tap, so after the recording
 * the button changes to the tap that opens it. See `useFilmVideo`.
 */

export interface FilmPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (index: number) => void;
}

export interface FilmPlayerProps {
  journeyId: string;
  /** The file-resolution film, recorded when the driver shares. */
  recap: Recap;
  /** What plays on screen. */
  playing: Recap;
  hasRoute: boolean;
  /** Frame to pick up from, so the film continues rather than restarts. */
  startIndex?: number;
  /** Every frame the film advances, for whoever needs to pick up where it is. */
  onFrame?: (index: number) => void;
  /** Start recording as soon as the player is up: the share button on the day screen. */
  autoRecord?: boolean;
  onClose?: () => void;
}

export const FilmPlayer = forwardRef<FilmPlayerHandle, FilmPlayerProps>(function FilmPlayer(
  { journeyId, recap, playing, hasRoute, startIndex, onFrame, autoRecord = false, onClose },
  ref,
) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const video = useFilmVideo({ journeyId, hasRoute });

  const previewRef = useRef<FilmStageHandle>(null);
  const exportRef = useRef<FilmStageHandle>(null);
  const [recording, setRecording] = useState(autoRecord);
  // The preview warms its tiles before it plays; until then the opening card
  // holds the screen and this says why.
  const [warming, setWarming] = useState(true);

  useImperativeHandle(
    ref,
    () => ({
      play: () => previewRef.current?.play(),
      pause: () => previewRef.current?.pause(),
      seek: (index: number) => previewRef.current?.seek(index),
    }),
    [],
  );

  // The share button on the day screen opens this player already recording.
  // `begin` moves the state machine to "preparing" so the label and the
  // overlay say so from the first frame.
  useEffect(() => {
    if (autoRecord) video.begin();
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreviewMessage = useCallback(
    (message: RecapMessage) => {
      if (message.type === 'ready' && startIndex !== undefined && startIndex > 0) {
        previewRef.current?.seek(startIndex);
        return;
      }
      if (message.type === 'progress' && message.phase === 'tiles') {
        setWarming(message.value < 1);
        return;
      }
      if (message.type === 'frame') {
        setWarming(false);
        onFrame?.(message.index);
      }
    },
    // `startIndex` is read once, at 'ready'; a later change must not reseek a
    // film the driver is watching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFrame],
  );

  const handleExportMessage = useCallback(
    (message: RecapMessage) => {
      if (message.type === 'ready') {
        exportRef.current?.record();
        return;
      }
      video.handleMessage(message);
      if (message.type === 'done' || message.type === 'error') setRecording(false);
    },
    [video],
  );

  function startRecording() {
    previewRef.current?.pause();
    video.begin();
    setRecording(true);
  }

  function cancelRecording() {
    setRecording(false);
    video.reset();
    previewRef.current?.play();
  }

  const fileReady = video.phase === 'ready' || video.phase === 'done';

  function primaryAction() {
    if (fileReady) {
      video.share();
      return;
    }
    startRecording();
  }

  const primaryLabel = recording
    ? labelFor(video.phase, video.progress)
    : video.phase === 'sharing'
      ? 'Abrindo o compartilhamento'
      : fileReady
        ? video.canShareSheet
          ? 'Enviar para o story'
          : 'Baixar o vídeo'
        : 'Compartilhar vídeo';

  // On the web the tap that opens the share sheet has to reach
  // `navigator.share` inside the browser's own click event. A Pressable
  // hands the press through React Native Web's responder system, and iOS
  // has been seen treating that as no gesture at all and refusing the sheet.
  // So while the file is ready, a real DOM button sits over the styled one,
  // invisible, and takes the click first.
  const webShareTap =
    Platform.OS === 'web' && fileReady && video.phase !== 'sharing'
      ? createElement('button', {
          type: 'button',
          'aria-label': primaryLabel,
          onClick: (event: { preventDefault: () => void }) => {
            event.preventDefault();
            video.share();
          },
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            border: 'none',
            padding: 0,
            margin: 0,
            background: 'transparent',
            cursor: 'pointer',
          },
        })
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: darkTokens.backgroundPrimary }}>
      {recording ? (
        <FilmStage key="export" ref={exportRef} recap={recap} mode="export" onMessage={handleExportMessage} />
      ) : (
        <Pressable
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel="Tocar o filme de novo"
          onPress={() => previewRef.current?.play()}
        >
          {/* Not interactive: an iframe swallows every tap that lands on it,
              and the Pressable around it is the control. */}
          <FilmStage
            key="preview"
            ref={previewRef}
            recap={playing}
            mode="preview"
            interactive={false}
            onMessage={handlePreviewMessage}
          />
        </Pressable>
      )}

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <IconButton
          icon={onClose ? 'close' : 'chevronLeft'}
          label={recording ? 'Cancelar a gravação' : 'Fechar'}
          tone="surface"
          onPress={() => (recording ? cancelRecording() : onClose?.())}
        />
        {!recording && warming ? <Pill text="Carregando o mapa" /> : null}
      </View>

      {recording ? <RecordingOverlay phase={video.phase} progress={video.progress} /> : null}

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        {video.error ? (
          <Notice icon="alert" text={video.error} />
        ) : !hasRoute ? (
          // Saying why there is no map beats letting the person think it
          // broke. It is also where GPS counting gets discovered.
          <Notice
            icon="info"
            text="Sem trajeto nesta jornada. Ligue a contagem por GPS em Registrar para o próximo dia ter mapa."
          />
        ) : fileReady && !recording ? (
          <Notice
            icon="check"
            text={
              video.canShareSheet
                ? 'Vídeo pronto. Toque para escolher onde postar.'
                : 'Vídeo pronto. Este navegador não abre a tela de compartilhar, então ele baixa o arquivo.'
            }
          />
        ) : null}

        <View style={{ position: 'relative' }}>
          <Button
            label={primaryLabel}
            size="lg"
            fullWidth
            iconName={recording || video.phase === 'sharing' ? undefined : 'arrowUpRight'}
            loading={video.phase === 'sharing'}
            disabled={recording || video.phase === 'sharing'}
            onPress={primaryAction}
          />
          {webShareTap}
        </View>

        {recording ? (
          <Button label="Cancelar" variant="ghost" size="sm" fullWidth onPress={cancelRecording} />
        ) : fileReady ? (
          <Button label="Gravar de novo" variant="ghost" size="sm" fullWidth onPress={startRecording} />
        ) : null}
      </View>
    </View>
  );
});

function labelFor(phase: VideoPhase, progress: number): string {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  switch (phase) {
    case 'preparing':
      return `Carregando o mapa: ${percent}%`;
    case 'rendering':
      return `Gravando: ${percent}%`;
    case 'encoding':
      return `Finalizando: ${percent}%`;
    case 'sharing':
      return 'Abrindo o compartilhamento';
    default:
      return 'Preparando';
  }
}

function Pill({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.pill,
        backgroundColor: darkTokens.surfacePrimary,
      }}
    >
      <Text variant="captionStrong" style={{ color: darkTokens.textSecondary }}>
        {text}
      </Text>
    </View>
  );
}

function Notice({ icon, text }: { icon: 'alert' | 'info' | 'check'; text: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        backgroundColor: darkTokens.surfacePrimary,
        borderRadius: theme.radius.xl,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      <Icon name={icon} size={16} color={darkTokens.textSecondary} />
      <Text variant="caption" style={{ color: darkTokens.textSecondary, flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * A light veil, not a curtain.
 *
 * What is being recorded stays visible, because that is what the twenty
 * second wait has going for it: you get to watch it happen.
 */
function RecordingOverlay({ phase, progress }: { phase: VideoPhase; progress: number }) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        paddingTop: 96,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          backgroundColor: darkTokens.surfacePrimary,
          borderRadius: theme.radius.pill,
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: darkTokens.brandSecondary }} />
        <Text variant="captionStrong" style={{ color: darkTokens.textPrimary, letterSpacing: 0.6 }}>
          {phase === 'preparing' ? 'PREPARANDO' : 'GRAVANDO'}
        </Text>
      </View>
      <View
        style={{
          marginTop: theme.spacing.sm,
          height: 4,
          width: '70%',
          borderRadius: 999,
          backgroundColor: darkTokens.borderSubtle,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: 4,
            borderRadius: 999,
            backgroundColor: darkTokens.brandSecondary,
            width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
          }}
        />
      </View>
    </View>
  );
}
