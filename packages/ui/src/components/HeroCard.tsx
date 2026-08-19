import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../icons/Icon';
import { Gradient } from './Gradient';
import { Text } from './Text';

export interface HeroCardProps {
  /** Small line above the figure, e.g. "Lucro de hoje". */
  label: string;
  /** The figure. Passed as a node so Home can animate it with <Money />. */
  children: ReactNode;
  /** Top-left mark — the vehicle plate, the platform, the period. */
  tag?: string;
  tagIcon?: IconName;
  /** Top-right line, e.g. the date. */
  meta?: string;
  /** Two label/value pairs along the bottom. */
  details?: { label: string; value: string }[];
  /** Draws the second card peeking out behind. Off on narrow screens. */
  stacked?: boolean;
  /** Anything pinned under the figure — a progress bar, a button. */
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The headline card on Home.
 *
 * Two cards in a stack, the back one offset and in the accent hue: the app's
 * one piece of shape identity, and the reason Home is recognisable from across
 * a car. Everything on it renders in `textOnBrand`, which is asserted against
 * the brand fill by the token tests.
 */
export function HeroCard({
  label,
  children,
  tag,
  tagIcon,
  meta,
  details,
  stacked = true,
  footer,
  style,
}: HeroCardProps) {
  const theme = useTheme();

  // How much of the second card shows above the first. Enough for its own
  // label to be readable, not so much that it competes with the figure.
  const peek = 30;

  return (
    <View style={[{ paddingTop: stacked ? peek : 0 }, style]}>
      {stacked ? (
        <Gradient
          colors={[theme.colors.heroBackFrom, theme.colors.heroBackTo]}
          direction="horizontal"
          radius={theme.radius['2xl']}
          style={{
            position: 'absolute',
            top: 0,
            left: theme.spacing.lg,
            right: theme.spacing.lg,
            height: peek + theme.radius['3xl'],
          }}
        >
          <View
            style={{
              height: peek,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: theme.spacing.lg,
            }}
          >
            <Icon name="sparkle" size={14} color={theme.colors.textOnBrand} />
            <Text variant="overline" color="onBrand">
              DINAMIQUE
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
