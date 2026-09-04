import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export type RatioTone = 'brand' | 'accent' | 'success' | 'danger' | 'warning' | 'neutral';

export interface RatioSegment {
  label: string;
  /** Any non-negative number in a consistent unit, usually cents. */
  amount: number;
  tone: RatioTone;
  /** The already-formatted figure shown in the legend. */
  display: string;
}

export interface RatioBarProps {
  segments: RatioSegment[];
  /** Off when the labels around the bar already say what it splits. */
  legend?: boolean;
  height?: number;
  /** Overrides what a screen reader is told, when the legend is off. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * One bar split into proportional parts: of everything that came in, this much
 * stayed.
 *
 * It exists because the period summary was a paragraph, five sentences of the
 * same size and colour each carrying one number. Nobody sees a ratio in a
 * paragraph. The bar shows it before a figure is read and the legend under it
 * keeps the exact values, so it is the shape and the number, not one or the
 * other (§13, §116).
 */
export function RatioBar({ segments, legend = true, height = 12, label, style }: RatioBarProps) {
  const theme = useTheme();

  const fills: Record<RatioTone, string> = {
    brand: theme.colors.brandPrimary,
    accent: theme.colors.brandSecondary,
    success: theme.colors.success,
    danger: theme.colors.danger,
    warning: theme.colors.warning,
    neutral: theme.colors.borderStrong,
  };

  const positive = segments.filter((segment) => segment.amount > 0);
  const total = positive.reduce((acc, segment) => acc + segment.amount, 0);

  return (
    <View style={[{ gap: theme.spacing.md }, style]}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          label ?? segments.map((segment) => `${segment.label}: ${segment.display}`).join(', ')
        }
        style={{
          flexDirection: 'row',
          height,
          borderRadius: theme.radius.pill,
          overflow: 'hidden',
          backgroundColor: theme.colors.backgroundSecondary,
          gap: total > 0 ? 2 : 0,
        }}
      >
        {positive.map((segment) => (
          <View
            key={segment.label}
            style={{ flex: segment.amount / total, backgroundColor: fills[segment.tone] }}
          />
        ))}
      </View>

      {legend ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.lg }}>
          {segments.map((segment) => (
            <View key={segment.label} style={{ gap: 2, minWidth: 96 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: theme.radius.pill,
                    backgroundColor: fills[segment.tone],
                  }}
                />
                <Text variant="caption" color="secondary">
                  {segment.label}
                </Text>
              </View>
              <Text variant="bodyStrong">{segment.display}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
