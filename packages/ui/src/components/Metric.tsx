import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { Cents } from '@dinamique/types';
import { formatCents } from '@dinamique/utils';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface MetricProps {
  label: string;
  /** Pass null when the metric cannot be computed — see §6. */
  value: string | null;
  hint?: string;
  /** Shown instead of the value when it is null. */
  emptyHint?: string;
  align?: 'left' | 'center';
  style?: StyleProp<ViewStyle>;
}

/**
 * A single figure with its label. When `value` is null the metric renders an
 * honest dash and an explanation, never a zero — an invented R$/km is worse
 * than no R$/km (§6, §131).
 */
export function Metric({ label, value, hint, emptyHint, align = 'left', style }: MetricProps) {
  const theme = useTheme();
  const alignment = align === 'center' ? 'center' : 'flex-start';

  return (
    <View style={[{ alignItems: alignment, gap: theme.spacing.xxs }, style]}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      {value === null ? (
        <>
          <Text variant="moneyMedium" color="muted">
            —
          </Text>
          {emptyHint ? (
            <Text variant="caption" color="muted">
              {emptyHint}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Text variant="moneyMedium">{value}</Text>
          {hint ? (
            <Text variant="caption" color="muted">
              {hint}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Convenience wrapper for the common "cents or nothing" case. */
export function CurrencyMetric({
  label,
  value,
  ...rest
}: Omit<MetricProps, 'value'> & { value: Cents | null }) {
  return <Metric label={label} value={value === null ? null : formatCents(value)} {...rest} />;
}
