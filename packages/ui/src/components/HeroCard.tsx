import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../icons/Icon';
import { Gradient } from './Gradient';
import { Text } from './Text';

export interface HeroBackCard {
  /** Short label on the left, e.g. "Meta do mês". */
  label: string;
  /** Figure or status on the right, e.g. "62% batida". */
  value: string;
  icon?: IconName;
  /** 0 to 1. Draws a thin progress line along the very top of the card. */
  progress?: number;
}

export interface HeroCardProps {
  /** Small line above the figure, e.g. "Lucro de hoje". */
  label: string;
  /** The figure. Passed as a node so Home can animate it with <Money />. */
  children: ReactNode;
  /** Top-left mark: the period, the vehicle, the platform. */
  tag?: string;
  tagIcon?: IconName;
  /** Top-right line, e.g. the date. */
  meta?: string;
  /** Two or three label/value pairs along the bottom. */
  details?: { label: string; value: string }[];
  /**
   * The card behind. It carries real information rather than decoration: the
   * strip that shows above the front card is prime space, and a driver
   * glancing at Home should get a second fact out of it for free.
   */
  back?: HeroBackCard;
  /** Anything pinned under the figure, e.g. a live journey pill. */
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** How much of the back card shows above the front one. */
const PEEK = 34;

/**
 * The headline card on Home.
 *
 * Two cards in a stack: the app's one piece of shape identity, and the reason
 * Home is recognisable from across a car. The front card is brand blue with
 * white type; the back card is a vivid orange with dark type, which is what
 * lets it be that bright and still readable.
 */
export function HeroCard({
  label,
  children,
  tag,
  tagIcon,
  meta,
  details,
  back,
  footer,
  style,
}: HeroCardProps) {
  const theme = useTheme();
  const ink = theme.colors.textOnHeroBack;
  const ratio = back?.progress === undefined ? null : Math.max(0, Math.min(1, back.progress));

  return (
    <View style={[{ paddingTop: back ? PEEK : 0 }, style]}>
      {back ? (
        <Gradient
          colors={[theme.colors.heroBackFrom, theme.colors.heroBackTo]}
          direction="horizontal"
          radius={theme.radius['2xl']}
          style={{
            position: 'absolute',
            top: 0,
            left: theme.spacing.lg,
            right: theme.spacing.lg,
            height: PEEK + theme.radius['3xl'],
          }}
        >
          {ratio === null ? null : (
            <View
              style={{
                height: 3,
                width: `${Math.round(ratio * 100)}%`,
                backgroundColor: ink,
                opacity: 0.55,
                borderBottomRightRadius: theme.radius.pill,
              }}
            />
          )}
          <View
            style={{
              height: ratio === null ? PEEK : PEEK - 3,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xs,
              paddingHorizontal: theme.spacing.lg,
            }}
          >
            {back.icon ? <Icon name={back.icon} size={14} color={ink} /> : null}
            <Text variant="captionStrong" style={{ color: ink }} numberOfLines={1}>
              {back.label}
            </Text>
            <Text
              variant="captionStrong"
              style={{ color: ink, marginLeft: 'auto' }}
              numberOfLines={1}
            >
              {back.value}
            </Text>
          </View>
        </Gradient>
      ) : null}

      <Gradient
        colors={[theme.colors.heroFrom, theme.colors.heroTo]}
        direction="diagonal"
        radius={theme.radius['3xl']}
        style={[{ padding: theme.spacing.xl, gap: theme.spacing.lg }, theme.elevation.lg]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            {tagIcon ? <Icon name={tagIcon} size={16} color={theme.colors.textOnBrand} /> : null}
            {tag ? (
              <Text variant="captionStrong" color="onBrand">
                {tag}
              </Text>
            ) : null}
          </View>
          {meta ? (
            <Text variant="caption" color="onBrand" style={{ opacity: 0.85 }}>
              {meta}
            </Text>
          ) : null}
        </View>

        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="caption" color="onBrand" style={{ opacity: 0.85 }}>
            {label}
          </Text>
          {children}
        </View>

        {footer}

        {details && details.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: theme.spacing.xl, flexWrap: 'wrap' }}>
            {details.map((detail) => (
              <View key={detail.label} style={{ gap: 2 }}>
                <Text variant="caption" color="onBrand" style={{ opacity: 0.8 }}>
                  {detail.label}
                </Text>
                <Text variant="bodyStrong" color="onBrand">
                  {detail.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Gradient>
    </View>
  );
}
