import { useEffect, useRef, useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import type { Cents } from '@dinamique/types';
import { formatCents } from '@dinamique/utils';
import { useTheme } from '../theme/ThemeProvider';
import { useReducedMotion } from '../hooks/useReducedMotion';
import type { TypographyToken } from '../tokens/index';
import { Text } from './Text';

export interface MoneyProps {
  value: Cents;
  variant?: TypographyToken;
  /** Colour the figure by sign: profit green, loss red. Off by default. */
  colorBySign?: boolean;
  signed?: boolean;
  withSymbol?: boolean;
  /** Count up on mount/change (§18). Disabled automatically for reduced motion. */
  animate?: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * The headline number. Counting up is a deliberate, short animation: it draws
 * the eye to the figure, which is the one thing a driver opens the app for.
 *
 * The count is driven by requestAnimationFrame, not by a 16ms timer. A timer
 * keeps firing while the browser is busy laying out or painting, so the work
 * queues up behind itself and the figure stutters; the frame callback is
 * skipped instead, and the easing reads the real elapsed time, so a dropped
 * frame costs nothing. It also stops on its own when the tab is in the
 * background, which the timer did not.
 */
export function Money({
  value,
  variant = 'moneyHero',
  colorBySign = false,
  signed = false,
  withSymbol = true,
  animate = false,
  style,
}: MoneyProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const counts = animate && !reduced;

  const [displayed, setDisplayed] = useState(counts ? 0 : value);
  const frame = useRef<number | null>(null);
  const previous = useRef(counts ? 0 : value);

  useEffect(() => {
    if (!counts) {
      setDisplayed(value);
      previous.current = value;
      return;
    }

    const from = previous.current;
    const to = value;
    if (from === to) {
      setDisplayed(to);
      return;
    }

    const startedAt = Date.now();
    const duration = theme.motion.counter;

    const tick = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      // easeOutCubic – fast first, settles gently on the final figure
      const eased = 1 - (1 - progress) ** 3;
      setDisplayed(Math.round(from + (to - from) * eased));

      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        frame.current = null;
        previous.current = to;
      }
    };

    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      previous.current = value;
    };
  }, [counts, theme.motion.counter, value]);

  const color = colorBySign ? (value < 0 ? 'danger' : 'success') : 'primary';

  return (
    <Text
      variant={variant}
      color={color}
      style={style}
      accessibilityLabel={formatCents(value, { withSymbol: true, signed })}
    >
      {formatCents(displayed, { withSymbol, signed })}
    </Text>
  );
}
