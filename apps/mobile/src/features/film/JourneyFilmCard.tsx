import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, View } from 'react-native';
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
import { FilmPlayer } from './FilmPlayer';
import { FilmThumbnail, type FilmThumbnailHandle } from './FilmThumbnail';
import { useJourneyFilm } from './useJourneyFilm';

/** The side of the square the film plays in on the day screen. */
const THUMBNAIL = 112;

/**
 * One journey's film, on the day screen.
 *
 * A small square, already playing, with the journey's numbers beside it and
 * the share button under it. Tapping the square grows the film to full
 * screen, picking up at the frame the square was on, so what the driver sees
 * is the same film getting bigger rather than a second one starting over.
 * Closing hands the frame back the same way. Sharing opens the same full
 * screen already recording, because a recording is something to watch and a
 * square this size is not the place to watch it.
 */
export function JourneyFilmCard({ journeyId, label }: { journeyId: string; label: string }) {
  const theme = useTheme();
  const film = useJourneyFilm(journeyId);
  const [full, setFull] = useState<null | { record: boolean }>(null);
  const thumbRef = useRef<FilmThumbnailHandle>(null);
  // Where the film is, updated every frame from whichever player is showing.
  // A ref, not state: thirty updates a second must not redraw the screen.
  const frame = useRef(0);

  const hasRoute = film.recap?.hasRoute ?? false;

  useEffect(() => {
    if (film.recap) {
      void track('journey_film_viewed', { journey_id: journeyId, has_route: hasRoute, surface: 'card' });
    }
  }, [film.recap, hasRoute, journeyId]);

  if (film.loading) {
    return <Skeleton height={THUMBNAIL + 2 * theme.spacing.lg} radius={theme.radius['2xl']} />;
  }

  if (!film.recap || !film.preview || !film.card) return null;

  const figures = [
    film.summary?.distance ? formatDistanceKm(film.summary.distance, 1) : null,
    film.summary?.workedSeconds ? formatDuration(film.summary.workedSeconds) : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
            <Text variant="caption" color="secondary">
              {label}
            </Text>
            {timeRange(film.startedAt, film.endedAt) ? (
              <Text variant="bodyStrong">{timeRange(film.startedAt, film.endedAt)}</Text>
            ) : null}
            {figures ? (
              <Text variant="caption" color="muted">
                {figures}
              </Text>
            ) : null}
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
