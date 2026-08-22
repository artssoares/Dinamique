import {
  Animated,
  Pressable,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { usePressMotion } from '../hooks/usePressMotion';
import type { RadiusToken, SpacingToken } from '../tokens/index';

export type CardTone = 'surface' | 'secondary' | 'inverse' | 'brand';

export interface CardProps extends ViewProps {
  padding?: SpacingToken;
  radius?: RadiusToken;
  elevated?: boolean;
  /** Cards are borderless by default – whitespace does the separating (§14). */
  bordered?: boolean;
  tone?: CardTone;
  /** Makes the whole card a control. Adds a press state and a button role. */
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Card({
  padding = 'xl',
  radius = '2xl',
  elevated = false,
  bordered = false,
  tone = 'surface',
  onPress,
  accessibilityLabel,
  style,
  ...rest
}: CardProps) {
  const theme = useTheme();
  // A card is a large surface: the same 0.97 that suits a button would look
  // like the whole page moved, so it barely dips.
  const press = usePressMotion({ scale: 0.985, opacity: 0.92, disabled: !onPress });

  const tones: Record<CardTone, string> = {
    surface: elevated ? theme.colors.surfaceElevated : theme.colors.surfacePrimary,
    secondary: theme.colors.surfaceSecondary,
    inverse: theme.colors.surfaceInverse,
    brand: theme.colors.brandPrimarySubtle,
  };

  const base: StyleProp<ViewStyle> = [
    {
      backgroundColor: tones[tone],
      borderRadius: theme.radius[radius],
      padding: theme.spacing[padding],
      borderWidth: bordered ? 1 : 0,
      borderColor: theme.colors.borderSubtle,
    },
    elevated ? theme.elevation.md : null,
    style,
  ];

  if (onPress) {
    return (
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        {...press.handlers}
        style={[base, press.style]}
        {...rest}
      />
    );
  }

  return <View {...rest} style={base} />;
}
