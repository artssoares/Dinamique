import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

/** A short day and a long day should both feel watchable, so the clock bends. */
export const MIN_REPLAY_MS = 6_000;
export const MAX_REPLAY_MS = 16_000;
const MS_PER_POINT = 18;

/**
 * How many times the replay may move React during a run.
 *
 * A thousand-point route at sixty frames a second would otherwise commit on
 * most frames — and on the native replay every commit rebuilds the GeoJSON
 * slice the map is drawing. Capping the steps keeps the readout smooth to the
 * eye (a dozen updates a second is well past where a climbing number stops
 * looking stepped) and takes the work off the frame budget.
 */
export const MAX_REPLAY_STEPS = 180;

export function replayDuration(pointCount: number): number {
  return Math.min(MAX_REPLAY_MS, Math.max(MIN_REPLAY_MS, pointCount * MS_PER_POINT));
}

export interface RouteAnimation {
  /** 0→1 across the whole route. Feed it straight to strokeDashoffset. */
  progress: Animated.Value;
  /** Index of the last point revealed. Whole numbers only — see below. */
  index: number;
  playing: boolean;
  finished: boolean;
  toggle: () => void;
  restart: () => void;
}

/**
 * Drives the line being drawn, and the numbers climbing beside it.
 *
 * `Animated.Value` rather than Reanimated because that is how everything else
 * in the app animates (`ProgressRing`, `GoalProgress`), and one animation
 * library is a smaller thing to maintain than two.
 *
 * The listener is where the care goes. The animation runs at the display's
 * refresh rate, so re-rendering on every frame would put sixty React commits a
 * second on screen for the length of the replay — on a mid-range Android that
 * is the difference between a smooth line and a stutter. State moves only when
 * the *integer* point index changes, which is what the distance readout and
 * the marker actually need; the line itself is driven by the value directly
 * and never touches React at all.
 *
 * `useNativeDriver` stays off: `strokeDashoffset` is not a native property,
 * and a listener on a natively-driven value would not fire on the JS side
 * anyway.
 */
export function useRouteAnimation(pointCount: number, autoPlay = true): RouteAnimation {
  const progress = useRef(new Animated.Value(0)).current;
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const [finished, setFinished] = useState(false);

  const lastIndex = Math.max(0, pointCount - 1);
  const steps = Math.max(1, Math.min(lastIndex, MAX_REPLAY_STEPS));
  const duration = useMemo(() => replayDuration(pointCount), [pointCount]);

  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      // Quantised to the step grid first, so a frame that moved the line by
      // less than one step costs nothing at all.
      const step = Math.round(value * steps);
      const next = Math.round((step / steps) * lastIndex);
      setIndex((current) => (current === next ? current : next));
    });
    return () => progress.removeListener(id);
  }, [progress, lastIndex, steps]);

  // A different route is a different replay: the value has to go home, or the
  // second journey opens with its line already drawn.
  useEffect(() => {
    animation.current?.stop();
    progress.setValue(0);
    setIndex(0);
    setFinished(false);
    setPlaying(autoPlay);
  }, [pointCount, progress, autoPlay]);

  const run = useCallback(
    (from: number) => {
      progress.setValue(from);
      const remaining = Math.max(1, duration * (1 - from));
      const next = Animated.timing(progress, {
        toValue: 1,
        duration: remaining,
        // Linear, deliberately. Easing a route makes it look like the driver
        // sped up and slowed down where they did not.
        easing: Easing.linear,
        useNativeDriver: false,
      });
      animation.current = next;
      next.start(({ finished: done }) => {
        if (!done) return;
        setPlaying(false);
        setFinished(true);
      });
    },
    [duration, progress],
  );

  useEffect(() => {
    if (!autoPlay) return;
    run(0);
    return () => animation.current?.stop();
  }, [autoPlay, run]);

  const restart = useCallback(() => {
    animation.current?.stop();
    setFinished(false);
    setPlaying(true);
    run(0);
  }, [run]);

  const toggle = useCallback(() => {
    // Replaying is the only thing "play" can mean once the line is complete —
    // resuming from the end would look like a dead button.
    if (finished) {
      restart();
      return;
    }
    if (playing) {
      animation.current?.stop();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    // `_value` is not public API, but it is the only way to resume from where
    // a stopped animation actually left off; the listener's copy lags by up to
    // a frame and the index is rounded, which would jump the line backwards.
    const current = (progress as unknown as { _value: number })._value ?? 0;
    run(Math.min(0.999, Math.max(0, current)));
  }, [finished, playing, progress, restart, run]);

  return { progress, index, playing, finished, toggle, restart };
}
