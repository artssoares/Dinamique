import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useReducedMotion } from '../hooks/useReducedMotion';

export interface RevealProps {
  children: ReactNode;
  /** Milliseconds to wait before starting. Stagger a list by index × 45. */
  delay?: number;
  /** How far it travels. Negative comes down from above. */
  distance?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fades and lifts its children into place on mount.
 *
 * Screens used to appear fully formed, which is what made the app feel dry:
 * nothing acknowledged that it had just arrived. Staggering the sections of a
 * screen by a few frames each reads as the page assembling itself, and costs
 * one opacity and one transform on the native thread.
 */
export function Reveal({ children, delay = 0, distance = 14, style }: RevealProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: theme.motion.slow,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, progress, reduced, theme.motion.slow]);

  return (
    <Animated.View
      style={[
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
          ],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}
