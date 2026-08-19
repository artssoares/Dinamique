import { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface ProgressRingProps {
  /** 0–1. Values above 1 are clamped: a goal is met, not exceeded twice. */
  ratio: number;
  size?: number;
  thickness?: number;
  /** Big label in the middle — usually the figure itself. */
  centreLabel?: string;
  /** Small line under it. */
  centreHint?: string;
  /** Overrides the arc colour. Defaults to brand, or success once reached. */
  color?: string;
  /** Describes the value to a screen reader. */
  label: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The goal ring.
 *
 * A bar tells you a percentage; a ring closing tells you how much of the day is
 * left in it. It is the one piece of visual identity on Home that is not a
 * rectangle, which is what makes the screen recognisable at a glance.
 *
 * The arc grows on mount for the same reason `GoalProgress` does: a static
 * shape reads as a picture, a growing one reads as progress (§18).
 */
export function ProgressRing({
  ratio,
  size = 168,
  thickness = 14,
  centreLabel,
  centreHint,
  color,
  label,
  style,
}: ProgressRingProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, ratio));
  const reached = clamped >= 1;

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: clamped,
      duration: theme.motion.slow,
      easing: Easing.out(Easing.cubic),
      // strokeDashoffset is not a native-driver property.
      useNativeDriver: false,
    }).start();
  }, [clamped, progress, theme.motion.slow]);

  const arcColor = color ?? (reached ? theme.colors.success : theme.colors.brandPrimary);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.backgroundSecondary}
          strokeWidth={thickness}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={arcColor}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={progress.interpolate({
            inputRange: [0, 1],
            outputRange: [circumference, 0],
          })}
          // Start the arc at twelve o'clock rather than three.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>

      {centreLabel ? (
        <View style={{ alignItems: 'center', gap: 2, paddingHorizontal: thickness }}>
          <Text
            variant="moneyLarge"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
            align="center"
          >
            {centreLabel}
          </Text>
          {centreHint ? (
            <Text variant="caption" color="secondary" align="center" numberOfLines={2}>
              {centreHint}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
