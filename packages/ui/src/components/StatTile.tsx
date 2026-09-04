import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../icons/Icon';
import { Text } from './Text';

export type StatTone = 'neutral' | 'brand' | 'accent' | 'success' | 'danger' | 'warning';

export interface StatTileProps {
  label: string;
  /** null when the figure cannot be computed – see §6. Never a fake zero. */
  value: string | null;
  emptyHint?: string;
  /** A short line under the figure: the unit, or what it was divided by. */
  hint?: string;
  icon?: IconName;
  tone?: StatTone;
  /**
   * 'plain' is a white card with a coloured icon. 'tinted' washes the whole
   * tile in the tone's subtle colour, which is what makes a grid of six
   * readable: plain, they are six white rectangles with six grey labels, and
   * every figure carries exactly the weight of every other one (§13).
   */
  variant?: 'plain' | 'tinted';
  /** Small delta line under the figure, e.g. "+12% vs. semana passada". */
  trend?: { label: string; direction: 'up' | 'down' | 'flat' };
  style?: StyleProp<ViewStyle>;
}

/**
 * A figure in a box: icon puck, label, value, and either a trend or a hint.
 *
 * The icon sits in a tinted puck rather than beside the label, so a grid is
 * scannable by colour and shape before a single word is read.
 */
export function StatTile({
  label,
  value,
  emptyHint,
  hint,
  icon,
  tone = 'neutral',
  variant = 'plain',
  trend,
  style,
}: StatTileProps) {
  const theme = useTheme();

  const tones: Record<StatTone, { ink: string; wash: string }> = {
    neutral: { ink: theme.colors.textSecondary, wash: theme.colors.backgroundSecondary },
    brand: { ink: theme.colors.brandPrimaryText, wash: theme.colors.brandPrimarySubtle },
    accent: { ink: theme.colors.brandSecondaryText, wash: theme.colors.brandSecondarySubtle },
    success: { ink: theme.colors.successText, wash: theme.colors.successSubtle },
    danger: { ink: theme.colors.dangerText, wash: theme.colors.dangerSubtle },
    warning: { ink: theme.colors.warningText, wash: theme.colors.warningSubtle },
  };

  const { ink, wash } = tones[tone];
  const tinted = variant === 'tinted';

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
          backgroundColor: tinted ? wash : theme.colors.surfacePrimary,
          borderWidth: 1,
          // A tinted tile is already separated from the page by its wash, and a
          // grey line on top of it only muddies the colour.
          borderColor: tinted ? 'transparent' : theme.colors.borderSubtle,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {icon ? (
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: theme.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              // On a tinted tile the puck would otherwise be the tile's colour.
              backgroundColor: tinted ? theme.colors.surfacePrimary : wash,
            }}
          >
            <Icon name={icon} size={15} color={ink} />
          </View>
        ) : null}
        <Text variant="caption" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </View>

      {value === null ? (
        <>
          <Text variant="moneyMedium" color="muted">
            –
          </Text>
          {emptyHint ? (
            <Text variant="caption" color="muted" numberOfLines={2}>
              {emptyHint}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          <Text
            variant="moneyMedium"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={tone === 'neutral' ? undefined : { color: ink }}
          >
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
          {hint && !trend ? (
            <Text variant="caption" color="muted" numberOfLines={2}>
              {hint}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

export interface StatGridProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The two-column wrap the tiles live in. Three screens each declared the same
 * row of flex properties inline, and when one of them drifts the grids stop
 * lining up with each other.
 */
export function StatGrid({ children, style }: StatGridProps) {
  const theme = useTheme();
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }, style]}>
      {children}
    </View>
  );
}
