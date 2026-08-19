import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface StepProgressProps {
  /** Zero-based index of the step being shown. */
  current: number;
  total: number;
  /** "Passo 2 de 6" under the bar. Off for the tour, where space is tight. */
  showCount?: boolean;
  countLabel?: (current: number, total: number) => string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Segmented progress for multi-step flows.
 *
 * Saying "passo 2 de 6" out loud matters more than it looks: an onboarding
 * whose length is unknown feels endless, and people abandon it.
 */
export function StepProgress({
  current,
  total,
  showCount = true,
  countLabel = (a, b) => `Passo ${a} de ${b}`,
  style,
}: StepProgressProps) {
  const theme = useTheme();
  const safeTotal = Math.max(1, total);
  const index = Math.max(0, Math.min(safeTotal - 1, current));

  return (
    <View style={[{ gap: theme.spacing.sm }, style]}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={countLabel(index + 1, safeTotal)}
        accessibilityValue={{ min: 0, max: safeTotal, now: index + 1 }}
        style={{ flexDirection: 'row', gap: theme.spacing.xs }}
      >
        {Array.from({ length: safeTotal }, (_, position) => (
          <View
            key={position}
            style={{
              flex: 1,
              height: 5,
              borderRadius: theme.radius.pill,
              backgroundColor:
                position <= index ? theme.colors.brandPrimary : theme.colors.borderSubtle,
            }}
          />
        ))}
      </View>

      {showCount ? (
        <Text variant="caption" color="secondary">
          {countLabel(index + 1, safeTotal)}
        </Text>
      ) : null}
    </View>
  );
}
