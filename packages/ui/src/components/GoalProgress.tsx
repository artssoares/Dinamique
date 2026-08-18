import { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import { formatCents } from '@dinamique/utils';
import type { GoalProgress as GoalProgressData } from '@dinamique/business-logic';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface GoalProgressProps {
  progress: GoalProgressData;
  label: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * The Home screen's centrepiece: target, achieved, percentage and what's left.
 * The bar grows on mount because a static bar reads as a picture; a growing one
 * reads as progress (§18).
 */
export function GoalProgress({ progress, label, style }: GoalProgressProps) {
  const theme = useTheme();
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: progress.ratio,
      duration: theme.motion.slow,
      easing: Easing.out(Easing.cubic),
      // Width cannot be driven on the native thread; the bar is cheap enough.
      useNativeDriver: false,
    }).start();
  }, [progress.ratio, theme.motion.slow, width]);

  const percent = Math.round(progress.ratio * 100);
  const barColor = progress.isReached ? theme.colors.success : theme.colors.brandPrimary;

  return (
    <View style={[{ gap: theme.spacing.md }, style]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="caption" color="secondary">
          {label}
        </Text>
        <Text variant="captionStrong" color={progress.isReached ? 'success' : 'brand'}>
          {percent}%
        </Text>
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        style={{
          height: 10,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.backgroundSecondary,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            height: '100%',
            borderRadius: theme.radius.pill,
            backgroundColor: barColor,
            width: width.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            }),
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="caption" color="secondary">
          {formatCents(progress.achieved)} de {formatCents(progress.target)}
        </Text>
        {progress.isReached ? (
          <Text variant="captionStrong" color="success">
            Meta batida
          </Text>
        ) : (
          <Text variant="caption" color="secondary">
            Faltam {formatCents(progress.remaining)}
          </Text>
        )}
      </View>
    </View>
  );
}
