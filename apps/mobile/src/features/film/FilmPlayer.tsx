import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Recap } from '@dinamique/recap';
import type { LatLng } from '@dinamique/types';
import { Button, darkTokens, Icon, IconButton, Text, ThemeScope, useTheme } from '@dinamique/ui';
import { BakedVideo, type BakedVideoHandle } from './BakedVideo';
import { BakingFilm } from './BakingFilm';
import { LegacyFilmPlayer } from './LegacyFilmPlayer';
import { ShareFilmButton, shareBakedFilm, useBakedFilm, type BakedFilmHandle } from './bakery';

/**
 * The film, full screen, with the one thing a driver does with it: share it.
 *
 * What plays is the finished video file, made in the background as soon as
 * the film was first on screen (see `bakery`). So it plays as smoothly as any
 * other video on the phone, and Compartilhar opens the share sheet at once,
 * with the very file that was just watched. If the file is still being made
 * when this opens, the day's route draws itself as the file progresses, and
 * a tap on Compartilhar on a phone is remembered: the sheet opens by itself
 * the moment the file exists.
 *
 * A device that cannot make the file frame by frame gets the previous
 * player, where the driver asks for the file and watches it record.
 */

export interface FilmPlayerProps {
  journeyId: string;
  /** The file-resolution film: the one made into the video. */
  recap: Recap;
  /** The lighter film the old player paints live. */
  playing: Recap;
  hasRoute: boolean;
  /** The route, drawn while the file is made. */
  points: readonly LatLng[];
  /** Seconds into the video to pick up from, so the film continues. */
  startSeconds?: number;
  /** Where the video was when the player closed, for whoever shows it next. */
  onLeave?: (seconds: number) => void;
  /** Open the share sheet as soon as the file is ready (phone only). */
  shareOnReady?: boolean;
  /** Old player only: the frame to pick up from, and every frame it reaches. */
  startIndex?: number;
  onFrame?: (index: number) => void;
  /** Old player only: start recording straight away. */
  autoRecord?: boolean;
  onClose?: () => void;
}

export function FilmPlayer(props: FilmPlayerProps) {
  // Urgent: the driver opened this film full screen, so it goes before any
  // other film waiting on the day screen.
  const bake = useBakedFilm(props.journeyId, props.recap, { urgent: true });

  if (bake.status === 'unsupported' || bake.status === 'failed') {
    return (
      <LegacyFilmPlayer
        journeyId={props.journeyId}
        recap={props.recap}
        playing={props.playing}
        hasRoute={props.hasRoute}
        startIndex={props.startIndex}
        onFrame={props.onFrame}
        autoRecord={props.autoRecord}
        onClose={props.onClose}
      />
    );
  }

  return <BakedFilmPlayer {...props} bake={bake} />;
}

function BakedFilmPlayer({
  journeyId,
  hasRoute,
  points,
  startSeconds = 0,
  onLeave,
  shareOnReady = false,
  onClose,
  bake,
}: FilmPlayerProps & { bake: BakedFilmHandle }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const videoRef = useRef<BakedVideoHandle>(null);
  const [paused, setPaused] = useState(false);
  const [box, setBox] = useState(0);
  // A tap on Compartilhar before the file exists, remembered. Phone only: a
  // browser opens the share sheet only from inside a tap, never later.
  const [armed, setArmed] = useState(shareOnReady && Platform.OS !== 'web');

  const ready = bake.status === 'ready' && bake.baked !== null;
  const percent = Math.round(bake.progress * 100);

  useEffect(() => {
    if (!armed || !ready || !bake.baked) return;
    setArmed(false);
    void shareBakedFilm(bake.baked, journeyId);
  }, [armed, bake.baked, journeyId, ready]);

  function close() {
    onLeave?.(videoRef.current?.time() ?? startSeconds);
    onClose?.();
  }

  function onBoxLayout(event: LayoutChangeEvent) {
    const next = Math.round(event.nativeEvent.layout.height);
    setBox((current) => (current === next ? current : next));
  }

  const label = ready
    ? 'Compartilhar vídeo'
    : armed
      ? `Abre assim que ficar pronto: ${percent}%`
      : Platform.OS === 'web'
        ? `Preparando o vídeo: ${percent}%`
        : 'Compartilhar quando ficar pronto';

  return (
    // Escuro de propósito, como o próprio filme: ver `LegacyFilmPlayer`.
    <ThemeScope scheme="dark">
      <View style={{ flex: 1, backgroundColor: darkTokens.backgroundPrimary }}>
        <View
          pointerEvents="box-none"
          style={{
            paddingTop: insets.top + theme.spacing.xs,
            paddingBottom: theme.spacing.xs,
            paddingHorizontal: theme.spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <IconButton
            icon={onClose ? 'close' : 'chevronLeft'}
            label="Fechar"
            tone="surface"
            onPress={close}
          />
          {!ready ? <Pill text={`Montando o vídeo: ${percent}%`} /> : null}
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }} onLayout={onBoxLayout}>
          {ready && bake.baked ? (
            <Pressable
              style={{ flex: 1 }}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Continuar o filme' : 'Pausar o filme'}
              onPress={() => setPaused(!(videoRef.current?.toggle() ?? true))}
            >
              <BakedVideo
                ref={videoRef}
                uri={bake.baked.uri}
                fit="contain"
                startAt={startSeconds}
              />
              {paused ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: theme.radius.pill,
                      backgroundColor: theme.colors.surfacePrimary,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="play" size={30} color={theme.colors.textPrimary} />
                  </View>
                </View>
              ) : null}
            </Pressable>
          ) : box > 0 ? (
            <View style={{ paddingHorizontal: theme.spacing.xl }}>
              <BakingFilm
                points={points}
                progress={bake.progress}
                height={Math.round(Math.min(box * 0.8, 560))}
                caption="Montando o vídeo do seu dia. Fica pronto em segundos, e pode sair daqui que ele continua."
              />
            </View>
          ) : null}
        </View>

        <View
          pointerEvents="box-none"
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: insets.bottom + theme.spacing.md,
            gap: theme.spacing.sm,
          }}
        >
          {!hasRoute ? (
            // Saying why there is no map beats letting the person think it
            // broke. It is also where GPS counting gets discovered.
            <Notice text="Sem trajeto nesta jornada. Ligue a contagem por GPS em Registrar para o próximo dia ter mapa." />
          ) : null}

          <ShareFilmButton
            baked={ready ? bake.baked : null}
            journeyId={journeyId}
            label={label}
            disabled={!ready && (armed || Platform.OS === 'web')}
            onPress={() => {
              bake.prioritise();
              setArmed(true);
            }}
          />
          {armed ? (
            <Button
              label="Não abrir sozinho"
              variant="ghost"
              size="sm"
              fullWidth
              onPress={() => setArmed(false)}
            />
          ) : null}
        </View>
      </View>
    </ThemeScope>
  );
}

function Pill({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingVertical: theme.spacing.xs,
        paddingHorizontal: theme.spacing.sm,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surfacePrimary,
      }}
    >
      <Text variant="captionStrong" style={{ color: theme.colors.textSecondary }}>
        {text}
      </Text>
    </View>
  );
}

function Notice({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        backgroundColor: theme.colors.surfacePrimary,
        borderRadius: theme.radius.xl,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
      }}
    >
      <Icon name="info" size={16} color={theme.colors.textSecondary} />
      <Text variant="caption" style={{ color: theme.colors.textSecondary, flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}
