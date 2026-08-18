import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.js';
import { Text } from './Text.js';

export type BadgeTone = 'brand' | 'accent' | 'success' | 'danger' | 'warning' | 'neutral';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, tone = 'neutral', style }: BadgeProps) {
  const theme = useTheme();

  const tones: Record<BadgeTone, { background: string; text: Parameters<typeof Text>[0]['color'] }> = {
    brand: { background: theme.colors.brandPrimarySubtle, text: 'brand' },
    accent: { background: theme.colors.brandSecondarySubtle, text: 'accent' },
    success: { background: theme.colors.successSubtle, text: 'success' },
    danger: { background: theme.colors.dangerSubtle, text: 'danger' },
    warning: { background: theme.colors.warningSubtle, text: 'warning' },
    neutral: { background: theme.colors.backgroundSecondary, text: 'secondary' },
  };

  const selected = tones[tone];

  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: theme.spacing.xs,
          borderRadius: theme.radius.pill,
          backgroundColor: selected.background,
        },
        style,
      ]}
    >
      <Text variant="overline" color={selected.text}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

export interface CountBadgeProps {
  count: number;
  /** Above this, render "9+" so the bubble keeps its shape. */
  max?: number;
  style?: StyleProp<ViewStyle>;
}

/** The unread bubble on the bell and the Support tab (§71). */
export function CountBadge({ count, max = 9, style }: CountBadgeProps) {
  const theme = useTheme();
  if (count <= 0) return null;

  const label = count > max ? `${max}+` : String(count);

  return (
    <View
      accessibilityLabel={`${count} não lidas`}
      style={[
        {
          minWidth: 20,
          height: 20,
          paddingHorizontal: 5,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.brandSecondary,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text variant="overline" color="onBrand">
        {label}
      </Text>
    </View>
  );
}
