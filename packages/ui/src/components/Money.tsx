import { useEffect, useRef, useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import type { Cents } from '@dinamique/types';
import { formatCents } from '@dinamique/utils';
import { useTheme } from '../theme/ThemeProvider';
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
  const [displayed, setDisplayed] = useState(animate ? 0 : value);
  const frame = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previous = useRef(animate ? 0 : value);

  useEffect(() => {
    if (!animate) {
      setDisplayed(value);
      previous.current = value;
      return;
    }

    const from = previous.current;
    const to = value;
    const startedAt = Date.now();
    const duration = theme.motion.counter;

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(1, elapsed / duration);
      // easeOutCubic — fast first, settles gently on the final figure
      const eased = 1 - (1 - progress) ** 3;
      setDisplayed(Math.round(from + (to - from) * eased));

      if (progress < 1) {
        frame.current = setTimeout(tick, 16);
      } else {
        previous.current = to;
      }
    };

    tick();
    return () => {
      if (frame.current) clearTimeout(frame.current);
      previous.current = value;
    };
  }, [animate, theme.motion.counter, value]);

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
