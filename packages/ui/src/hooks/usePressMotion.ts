import { useCallback, useMemo, useRef } from 'react';
import { Animated, Platform } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

/**
 * On the native platforms transform and opacity can be handed to the
 * compositor and run off the JavaScript thread. React Native Web has no such
 * module, and asking for it there logs a warning on every animation, so the
 * flag is read once here rather than guessed at each call site.
 */
export const NATIVE_DRIVER = Platform.OS !== 'web';

export interface PressMotion {
  /** Spread onto a Pressable: onPressIn / onPressOut. */
  handlers: {
    onPressIn: () => void;
    onPressOut: () => void;
  };
  /** Spread into an Animated.View style. */
  style: {
    transform: { scale: Animated.AnimatedInterpolation<number> }[];
    opacity: Animated.AnimatedInterpolation<number>;
  };
}

export interface PressMotionOptions {
  /** How far the control shrinks while held. 1 disables the scale. */
  scale?: number;
  /** Opacity while held. */
  opacity?: number;
  disabled?: boolean;
}

/**
 * The press feel shared by every control.
 *
 * A `({ pressed }) => …` style is a state change: the control jumps to its
 * pressed size on touch down and jumps back on release, and two jumps in a row
 * is what reads as stiff. A spring settles instead, and because it interpolates
 * one driving value it costs a single animation per control rather than a
 * re-render per frame.
 *
 * Respects the reduce-motion setting: there the value simply does not move.
 */
export function usePressMotion({
  scale = 0.97,
  opacity = 0.9,
  disabled = false,
}: PressMotionOptions = {}): PressMotion {
  const reduced = useReducedMotion();
  const pressed = useRef(new Animated.Value(0)).current;

  const animate = useCallback(
    (to: number) => {
      if (reduced || disabled) {
        pressed.setValue(0);
        return;
      }
      Animated.spring(pressed, {
        toValue: to,
        // Stiff and well damped: fast enough to feel like a direct response,
        // slow enough to be seen. No overshoot on the way in, a hint of it on
        // the way back.
        stiffness: 320,
        damping: 22,
        mass: 0.6,
        useNativeDriver: NATIVE_DRIVER,
      }).start();
    },
    [disabled, pressed, reduced],
  );

  const handlers = useMemo(
    () => ({
      onPressIn: () => animate(1),
      onPressOut: () => animate(0),
    }),
    [animate],
  );

  const style = useMemo(
    () => ({
      transform: [
        { scale: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, scale] }) },
      ],
      opacity: pressed.interpolate({ inputRange: [0, 1], outputRange: [1, opacity] }),
    }),
    [opacity, pressed, scale],
  );

  return { handlers, style };
}
