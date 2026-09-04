import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recap, RecapMessage } from '@dinamique/recap';
import { Button, darkTokens, Icon, IconButton, Text, usePressMotion, useTheme } from '@dinamique/ui';
import { FilmStage, type FilmStageHandle } from './FilmStage';
import { useFilmVideo, type VideoPhase } from './useFilmVideo';

/**
 * The film, playing, with the one thing a driver does with it: share it.
 *
 * One component for both places the film appears. On the day screen it is a
 * card: the film is already playing when the screen opens, tapping it grows
 * it to full screen, and the share button sits right under it. Full screen
 * is the same player with the chrome moved to the edges. Keeping the two in
 * one file is what stops the card and the full screen drifting apart in what
 * they can do.
 *
 * Recording swaps the playing stage for a second one at file resolution,
 * in the same frame. It stays visible on purpose: a hidden page has its
 * `requestAnimationFrame` throttled to a frame a second, and the video would
 * come out that way. Watching it record is also the honest answer to "what is
 * it doing with my phone for twenty seconds".
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface FilmPlayerHandle {
  play: () => void;
  pause: () => void;
  seek: (index: number) => void;
}

export interface FilmPlayerProps {
  journeyId: string;
  /** The file-resolution film, recorded when the driver shares. */
  recap: Recap;
  /** What plays on screen: the card size or the full-screen size. */
  playing: Recap;
  hasRoute: boolean;
  trimmed: boolean;
  layout: 'card' | 'full';
  /** Frame to pick up from, so the film continues rather than restarts. */
  startIndex?: number;
  /** Every frame the film advances, for whoever needs to pick up where it is. */
  onFrame?: (index: number) => void;
  /** Card only: the whole picture is the control that opens full screen. */
  onExpand?: () => void;
  /** Full only: the back control. */
  onClose?: () => void;
}

export const FilmPlayer = forwardRef<FilmPlayerHandle, FilmPlayerProps>(function FilmPlayer(
  { journeyId, recap, playing, hasRoute, trimmed, layout, startIndex, onFrame, onExpand, onClose },
  ref,
) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const video = useFilmVideo({ journeyId, hasRoute });

  const previewRef = useRef<FilmStageHandle>(null);
  const exportRef = useRef<FilmStageHandle>(null);
  const [recording, setRecording] = useState(false);
  const press = usePressMotion({ scale: 0.985, opacity: 0.96, disabled: !onExpand || recording });

  useImperativeHandle(
    ref,
    () => ({
      play: () => previewRef.current?.play(),
      pause: () => previewRef.current?.pause(),
      seek: (index: number) => previewRef.current?.seek(index),
    }),
    [],
  );

  const handlePreviewMessage = useCallback(
    (message: RecapMessage) => {
      if (message.type === 'ready' && startIndex !== undefined && startIndex > 0) {
        previewRef.current?.seek(startIndex);
        return;
      }
      if (message.type === 'frame') onFrame?.(message.index);
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

  const stage = recording ? (
    <FilmStage key="export" ref={exportRef} recap={recap} mode="export" onMessage={handleExportMessage} />
  ) : (
    <FilmStage key="preview" ref={previewRef} recap={playing} mode="preview" onMessage={handlePreviewMessage} />
  );

  const notice = video.error ? (
    <Notice icon="alert" text={video.error} />
  ) : !hasRoute ? (
    // Saying why there is no map beats letting the person think it broke.
    // It is also where GPS counting gets discovered.
    <Notice
      icon="info"
      text="Sem trajeto nesta jornada. Ligue a contagem por GPS em Registrar para o próximo dia ter mapa."
    />
  ) : trimmed ? (
    <Notice icon="shield" text="As pontas do caminho foram cortadas, para não mostrar onde você começou e terminou." />
  ) : null;

  const shareButton = (
    <Button
      label={recording ? labelFor(video.phase, video.progress) : 'Compartilhar vídeo'}
      size="lg"
      fullWidth
      iconName={recording ? undefined : 'arrowUpRight'}
      loading={recording && video.phase === 'sharing'}
      disabled={recording}
      onPress={startRecording}
    />
  );

  if (layout === 'card') {
    return (
      <View style={{ gap: theme.spacing.sm }}>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Ver o filme em tela cheia"
          disabled={!onExpand || recording}
          onPress={onExpand}
          {...press.handlers}
          style={[
            {
              width: '100%',
              aspectRatio: 9 / 16,
              borderRadius: theme.radius['2xl'],
              overflow: 'hidden',
              backgroundColor: darkTokens.backgroundPrimary,
            },
            press.style,
          ]}
        >
          {stage}

          {/* The whole picture is the control, and this is what says so.
              Pinned rather than laid out because the stage underneath is a
              canvas whose size we do not control, and `pointerEvents` none so
              the badge never eats the tap it advertises. */}
          {!recording ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                right: theme.spacing.md,
                bottom: theme.spacing.md,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.xs,
                paddingVertical: theme.spacing.xs,
                paddingHorizontal: theme.spacing.sm,
                borderRadius: theme.radius.pill,
                backgroundColor: darkTokens.surfacePrimary,
              }}
            >
              <Icon name="expand" size={15} color={darkTokens.textPrimary} />
              <Text variant="captionStrong" style={{ color: darkTokens.textPrimary }}>
                Tela cheia
              </Text>
            </View>
          ) : (
            <RecordingOverlay phase={video.phase} progress={video.progress} />
          )}
        </AnimatedPressable>

        {notice}
        {shareButton}
        {recording ? (
          <Button label="Cancelar" variant="ghost" size="sm" fullWidth onPress={cancelRecording} />
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: darkTokens.backgroundPrimary }}>
      {recording ? (
        stage
      ) : (
        <Pressable
          style={{ flex: 1 }}
          accessibilityRole="button"
          accessibilityLabel="Tocar o filme de novo"
          onPress={() => previewRef.current?.play()}
        >
          {stage}
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
        }}
      >
        <IconButton
          icon={onClose ? 'close' : 'chevronLeft'}
          label={recording ? 'Cancelar a gravação' : 'Fechar'}
          tone="surface"
          onPress={() => (recording ? cancelRecording() : onClose?.())}
        />
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
        {notice}
        {shareButton}
        {recording ? (
          <Button label="Cancelar" variant="ghost" size="sm" fullWidth onPress={cancelRecording} />
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

function Notice({ icon, text }: { icon: 'alert' | 'info' | 'shield'; text: string }) {
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
