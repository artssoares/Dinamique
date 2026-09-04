import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { formatDistanceKm, formatDuration, toDateOnly } from '@dinamique/utils';
import { Button, Card, NATIVE_DRIVER, Skeleton, Text, useReducedMotion, useTheme } from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { useStoryShare } from '@/features/route/useStoryShare';
import { FilmPlayer, type FilmPlayerHandle } from './FilmPlayer';
import { useJourneyFilm } from './useJourneyFilm';

/**
 * One journey's film, on the day screen.
 *
 * The film is playing the moment the card is on screen: there is nothing to
 * open first, no still map standing in for it. Tapping it grows it to full
 * screen, and the full-screen film picks up at the frame the card was on,
 * so what the driver sees is the same film getting bigger, not a second one
 * starting over. Closing hands the frame back the same way.
 */
export function JourneyFilmCard({ journeyId, label }: { journeyId: string; label: string }) {
  const theme = useTheme();
  const film = useJourneyFilm(journeyId);
  const [full, setFull] = useState(false);
  const cardRef = useRef<FilmPlayerHandle>(null);
  // Where the film is, updated every frame from whichever player is showing.
  // A ref, not state: thirty updates a second must not redraw the screen.
  const frame = useRef(0);

  const hasRoute = film.recap?.hasRoute ?? false;
  const startedAt = film.startedAt;

  useEffect(() => {
    if (film.recap) {
      void track('journey_film_viewed', { journey_id: journeyId, has_route: hasRoute, surface: 'card' });
    }
  }, [film.recap, hasRoute, journeyId]);

  // Kept as a second, quieter way out: the story card is the still image
  // for people who want a picture rather than a video.
  const story = useStoryShare({
    points: film.points,
    date: toDateOnly(startedAt ? new Date(startedAt) : new Date()),
    distance: film.summary?.distance ? film.summary.distance : null,
    workedSeconds: film.summary?.workedSeconds ?? 0,
    revenuePerKm: film.summary?.revenuePerKm ?? null,
  });

  if (film.loading) {
    return <Skeleton height={480} radius={theme.radius['2xl']} />;
  }

  if (!film.recap || !film.preview || !film.card) return null;

  const subtitle = [
    timeRange(film.startedAt, film.endedAt),
    film.summary?.distance ? formatDistanceKm(film.summary.distance, 1) : null,
    film.summary?.workedSeconds ? formatDuration(film.summary.workedSeconds) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  function open() {
    cardRef.current?.pause();
    setFull(true);
  }

  function close() {
    setFull(false);
    cardRef.current?.seek(frame.current);
    cardRef.current?.play();
  }

  return (
    <>
      <Card padding="lg" style={{ gap: theme.spacing.md }}>
        <View style={{ gap: 2 }}>
          <Text variant="caption" color="secondary">
            {label}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>

        <FilmPlayer
          ref={cardRef}
          journeyId={journeyId}
          recap={film.recap}
          playing={film.card}
          hasRoute={hasRoute}
          trimmed={film.trimmed}
          layout="card"
          onFrame={(index) => {
            frame.current = index;
          }}
          onExpand={open}
        />

        {story.canShare ? (
          <Button
            label="Imagem para o story"
            variant="ghost"
            size="sm"
            fullWidth
            iconName="camera"
            onPress={story.open}
          />
        ) : null}
        {story.sheet}
      </Card>

      <FullScreenFilm visible={full} onClose={close}>
        <FilmPlayer
          journeyId={journeyId}
          recap={film.recap}
          playing={film.preview}
          hasRoute={hasRoute}
          trimmed={film.trimmed}
          layout="full"
          startIndex={frame.current}
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
 * The card growing into the whole screen.
 *
 * A modal rather than a route, so nothing the driver was looking at is torn
 * down: the day screen stays underneath, scrolled where it was, and the film
 * fades and scales up over it the way the sheets in the app do. The exit runs
 * the same spring backwards, and the card resumes at the frame the full
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
                scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
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
