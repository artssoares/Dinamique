import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../icons/Icon';
import { Text } from './Text';

export interface StatTileProps {
  label: string;
  /** null when the figure cannot be computed — see §6. Never a fake zero. */
  value: string | null;
  emptyHint?: string;
  icon?: IconName;
  tone?: 'neutral' | 'brand' | 'success' | 'danger' | 'warning';
  /** Small delta line under the figure, e.g. "+12% vs. semana passada". */
  trend?: { label: string; direction: 'up' | 'down' | 'flat' };
  style?: StyleProp<ViewStyle>;
}

/**
 * A figure in a box: label, value, optional trend. Used in grids where the
 * old code laid three `Metric`s in a row that collapsed on narrow screens.
 */
export function StatTile({
  label,
  value,
  emptyHint,
  icon,
  tone = 'neutral',
  trend,
  style,
}: StatTileProps) {
  const theme = useTheme();

  const tones = {
    neutral: theme.colors.textSecondary,
    brand: theme.colors.brandPrimary,
    success: theme.colors.successText,
    danger: theme.colors.dangerText,
    warning: theme.colors.warningText,
  } as const;

  const trendColor =
    trend?.direction === 'up'
      ? theme.colors.successText
      : trend?.direction === 'down'
        ? theme.colors.dangerText
        : theme.colors.textSecondary;

  return (
    <View
      style={[
        {
          flex: 1,
          minWidth: 132,
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.surfacePrimary,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        {icon ? <Icon name={icon} size={15} color={tones[tone]} /> : null}
        <Text variant="caption" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </View>

      {value === null ? (
        <>
          <Text variant="moneyMedium" color="muted">
            —
          </Text>
          {emptyHint ? (
            <Text variant="caption" color="muted" numberOfLines={2}>
              {emptyHint}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Text variant="moneyMedium" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {value}
          </Text>
          {trend ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs }}>
              <Icon
                name={trend.direction === 'down' ? 'trendDown' : 'trendUp'}
                size={13}
                color={trendColor}
              />
              <Text variant="caption" style={{ color: trendColor }} numberOfLines={1}>
                {trend.label}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
