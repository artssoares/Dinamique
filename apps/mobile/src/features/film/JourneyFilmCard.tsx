import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { formatDistanceKm, formatDuration } from '@dinamique/utils';
import {
  Button,
  Card,
  Icon,
  NATIVE_DRIVER,
  Skeleton,
  Text,
  useReducedMotion,
  useTheme,
} from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { BakedVideo, type BakedVideoHandle } from './BakedVideo';
import { BakingFilm } from './BakingFilm';
import { FilmPlayer } from './FilmPlayer';
import { FilmThumbnail, type FilmThumbnailHandle } from './FilmThumbnail';
import { ShareFilmButton, shareBakedFilm, useBakedFilm } from './bakery';
import { useJourneyFilm } from './useJourneyFilm';

/** The side of the square the film plays in on the day screen. */
const THUMBNAIL = 112;

/**
 * One journey's film, on the day screen.
 *
 * The moment the card is on screen the film starts being made into a video
 * file, in the background (see `bakery`). While it is, the square draws the
 * day's route as far as the file has got. Once it exists the square plays the
 * file itself, smoothly, and Compartilhar opens the share sheet at once with
 * that same file. There is no second viewing to wait through.
 *
 * Tapping the square grows the film to full screen, picking up where the
 * square was, so it is the same film getting bigger rather than a second one
 * starting over. Closing hands the place back the same way.
 *
 * On a phone, Compartilhar pressed before the file is ready is remembered:
 * the sheet opens by itself when it is. A browser only opens the sheet from
 * inside a tap, so there the button waits, with the progress on it.
 *
 * A device that cannot make the file frame by frame keeps the old card: the
 * film painted live, and sharing opens the full screen to record it.
 */
export function JourneyFilmCard({ journeyId, label }: { journeyId: string; label: string }) {
  const film = useJourneyFilm(journeyId);
  const bake = useBakedFilm(journeyId, film.recap);

  if (bake.status === 'unsupported' || bake.status === 'failed') {
    return <LiveFilmCard journeyId={journeyId} label={label} film={film} />;
  }

  return <BakedFilmCard journeyId={journeyId} label={label} film={film} bake={bake} />;
}

type Film = ReturnType<typeof useJourneyFilm>;
type Bake = ReturnType<typeof useBakedFilm>;

function BakedFilmCard({
  journeyId,
  label,
  film,
  bake,
}: {
  journeyId: string;
  label: string;
  film: Film;
  bake: Bake;
}) {
  const theme = useTheme();
  const [full, setFull] = useState(false);
  const videoRef = useRef<BakedVideoHandle>(null);
  // Seconds into the film, carried between the square and the full screen.
  const seconds = useRef(0);
  // Compartilhar pressed before the file existed. Phone only; see above.
  const [armed, setArmed] = useState(false);

  const hasRoute = film.recap?.hasRoute ?? false;
  const ready = bake.status === 'ready' && bake.baked !== null;
  const percent = Math.round(bake.progress * 100);

  useEffect(() => {
    if (film.recap) {
      void track('journey_film_viewed', {
        journey_id: journeyId,
        has_route: hasRoute,
        surface: 'card',
      });
    }
  }, [film.recap, hasRoute, journeyId]);

  useEffect(() => {
    if (!armed || !ready || !bake.baked) return;
    setArmed(false);
    void shareBakedFilm(bake.baked, journeyId);
  }, [armed, bake.baked, journeyId, ready]);

  if (film.loading) return <CardSkeleton />;
  if (!film.recap || !film.preview) return null;

  function open() {
    seconds.current = videoRef.current?.time() ?? seconds.current;
    bake.prioritise();
    setFull(true);
  }

  const shareLabel = ready
    ? 'Compartilhar vídeo'
    : armed
      ? `Abre assim que ficar pronto: ${percent}%`
      : Platform.OS === 'web'
        ? `Preparando o vídeo: ${percent}%`
        : 'Compartilhar vídeo';

  return (
    <>
      <Card padding="lg" style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver o filme em tela cheia"
            onPress={open}
            style={{
              width: THUMBNAIL,
              height: THUMBNAIL,
              borderRadius: theme.radius.xl,
              overflow: 'hidden',
            }}
          >
            {ready && bake.baked ? (
              // The square pauses while the full screen plays the same file:
              // one film decoding at a time, and it picks up where that one
              // left off.
              <BakedVideo
                ref={videoRef}
                uri={bake.baked.uri}
                fit="cover"
                playing={!full}
                startAt={seconds.current}
              />
            ) : (
              <BakingFilm
                points={film.points}
                progress={bake.progress}
                height={THUMBNAIL}
                radius={theme.radius.xl}
              />
            )}
          </Pressable>

          {/* The words beside the square are the same control: a driver who
              taps the title expects the same thing as one who taps the film. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver o filme em tela cheia"
            onPress={open}
            style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.7 : 1 })}
          >
            <CardText film={film} label={label} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.xs,
                marginTop: theme.spacing.xs,
              }}
            >
              <Icon name={ready ? 'expand' : 'clock'} size={14} color={theme.colors.brandPrimary} />
              <Text variant="captionStrong" style={{ color: theme.colors.brandPrimary }}>
                {ready ? 'Ver em tela cheia' : `Montando o vídeo: ${percent}%`}
              </Text>
            </View>
          </Pressable>
        </View>

        <ShareFilmButton
          baked={ready ? bake.baked : null}
          journeyId={journeyId}
          label={shareLabel}
          disabled={!ready && (armed || Platform.OS === 'web')}
          onPress={() => {
            bake.prioritise();
            setArmed(true);
          }}
        />
      </Card>

      <FullScreenFilm visible={full} onClose={() => setFull(false)}>
        <FilmPlayer
          journeyId={journeyId}
          recap={film.recap}
          playing={film.preview}
          hasRoute={hasRoute}
          points={film.points}
          startSeconds={seconds.current}
          onLeave={(at) => {
            seconds.current = at;
            videoRef.current?.seek(at);
          }}
          onClose={() => setFull(false)}
        />
      </FullScreenFilm>
    </>
  );
}

/**
 * The card as it was before films were made in the background: the film
 * painted live in the square, and Compartilhar opening the full screen to
 * record it. Only for devices that cannot make the file on their own.
 */
function LiveFilmCard({
  journeyId,
  label,
  film,
}: {
  journeyId: string;
  label: string;
  film: Film;
}) {
  const theme = useTheme();
  const [full, setFull] = useState<null | { record: boolean }>(null);
  const thumbRef = useRef<FilmThumbnailHandle>(null);
  // Where the film is, updated every frame from whichever player is showing.
  // A ref, not state: thirty updates a second must not redraw the screen.
  const frame = useRef(0);

  const hasRoute = film.recap?.hasRoute ?? false;

  useEffect(() => {
    if (film.recap) {
      void track('journey_film_viewed', {
        journey_id: journeyId,
        has_route: hasRoute,
        surface: 'card',
      });
    }
  }, [film.recap, hasRoute, journeyId]);

  if (film.loading) return <CardSkeleton />;

  if (!film.recap || !film.preview || !film.card) return null;

  function open(record: boolean) {
    thumbRef.current?.pause();
    setFull({ record });
  }

  function close() {
    setFull(null);
    thumbRef.current?.seek(frame.current);
    thumbRef.current?.play();
  }

  return (
    <>
      <Card padding="lg" style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'center' }}>
          <FilmThumbnail
            ref={thumbRef}
            recap={film.card}
            size={THUMBNAIL}
            onFrame={(index) => {
              frame.current = index;
            }}
            onPress={() => open(false)}
          />

          {/* The words beside the square are the same control: a driver who
              taps the title expects the same thing as one who taps the film. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver o filme em tela cheia"
            onPress={() => open(false)}
            style={({ pressed }) => ({ flex: 1, gap: 2, opacity: pressed ? 0.7 : 1 })}
          >
            <CardText film={film} label={label} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.xs,
                marginTop: theme.spacing.xs,
              }}
            >
              <Icon name="expand" size={14} color={theme.colors.brandPrimary} />
              <Text variant="captionStrong" style={{ color: theme.colors.brandPrimary }}>
                Ver em tela cheia
              </Text>
            </View>
          </Pressable>
        </View>

        <Button
          label="Compartilhar vídeo"
          size="lg"
          fullWidth
          iconName="arrowUpRight"
          onPress={() => open(true)}
        />
      </Card>

      <FullScreenFilm visible={full !== null} onClose={close}>
        <FilmPlayer
          journeyId={journeyId}
          recap={film.recap}
          playing={film.preview}
          hasRoute={hasRoute}
          points={film.points}
          startIndex={frame.current}
          autoRecord={full?.record ?? false}
          onFrame={(index) => {
            frame.current = index;
          }}
          onClose={close}
        />
      </FullScreenFilm>
    </>
  );
}

function CardSkeleton() {
  const theme = useTheme();
  return <Skeleton height={THUMBNAIL + 2 * theme.spacing.lg} radius={theme.radius['2xl']} />;
}

/** The journey's label, its hours and its figures, beside the square. */
function CardText({ film, label }: { film: Film; label: string }) {
  const figures = [
    film.summary?.distance ? formatDistanceKm(film.summary.distance, 1) : null,
    film.summary?.workedSeconds ? formatDuration(film.summary.workedSeconds) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const hours = timeRange(film.startedAt, film.endedAt);

  return (
    <>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      {hours ? <Text variant="bodyStrong">{hours}</Text> : null}
      {figures ? (
        <Text variant="caption" color="muted">
          {figures}
        </Text>
      ) : null}
    </>
  );
}

function timeRange(startedAt: string | null, endedAt: string | null): string | null {
  if (!startedAt) return null;
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return endedAt ? `${clock(startedAt)} às ${clock(endedAt)}` : clock(startedAt);
}

/**
 * The square growing into the whole screen.
 *
 * A modal rather than a route, so nothing the driver was looking at is torn
 * down: the day screen stays underneath, scrolled where it was, and the film
 * fades and scales up over it the way the sheets in the app do. The exit runs
 * the same spring backwards, and the square resumes at the frame the full
 * screen reached.
 */
function FullScreenFilm({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  // `mounted` lags `visible` on the way out so the exit animation can play.
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (reduced) {
        progress.setValue(1);
        return;
      }
      const animation = Animated.spring(progress, {
        toValue: 1,
        damping: 22,
        stiffness: 260,
        mass: 0.9,
        useNativeDriver: NATIVE_DRIVER,
      });
      animation.start();
      return () => animation.stop();
    }

    if (!mounted) return;
    if (reduced) {
      progress.setValue(0);
      setMounted(false);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: theme.motion.base,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    });
    animation.start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return () => animation.stop();
  }, [mounted, progress, reduced, theme.motion.base, visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaProvider>
        <Animated.View
          style={{
            flex: 1,
            opacity: progress,
            transform: [
              {
                scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
              },
            ],
          }}
        >
          {children}
        </Animated.View>
      </SafeAreaProvider>
    </Modal>
  );
}
