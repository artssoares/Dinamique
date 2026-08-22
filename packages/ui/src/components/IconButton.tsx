import { Animated, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { usePressMotion } from '../hooks/usePressMotion';
import { Icon, type IconName } from '../icons/Icon';
import { MIN_TOUCH_TARGET } from '../tokens/index';
import { CountBadge } from './Badge';

export type IconButtonTone = 'surface' | 'inverse' | 'brand' | 'ghost' | 'danger';

export interface IconButtonProps {
  icon: IconName;
  /** Required: an icon with no label is invisible to a screen reader. */
  label: string;
  onPress?: () => void;
  tone?: IconButtonTone;
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  /** Unread bubble pinned to the top-right corner. */
  badge?: number;
  style?: StyleProp<ViewStyle>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The circular icon button used by every header, the tab bar and the quick
 * actions row. Always at least 44dp of touch area, whatever the visual size.
 */
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'surface',
  size = MIN_TOUCH_TARGET,
  iconSize,
  disabled,
  badge,
  style,
}: IconButtonProps) {
  const theme = useTheme();
  // Rounder controls tolerate a deeper press than rectangles do.
  const press = usePressMotion({ scale: 0.92, opacity: 0.85, disabled });

  const tones: Record<IconButtonTone, { background: string; icon: string; border: string }> = {
    surface: {
      background: theme.colors.surfacePrimary,
      icon: theme.colors.textPrimary,
      border: theme.colors.borderSubtle,
    },
    inverse: {
      background: theme.colors.surfaceInverse,
      icon: theme.colors.textOnInverse,
      border: 'transparent',
    },
    brand: {
      background: theme.colors.brandPrimary,
      icon: theme.colors.textOnBrand,
      border: 'transparent',
    },
    ghost: { background: 'transparent', icon: theme.colors.textSecondary, border: 'transparent' },
    danger: {
      background: theme.colors.dangerSubtle,
      icon: theme.colors.dangerText,
      border: 'transparent',
    },
  };

  const palette = tones[tone];

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      {...press.handlers}
      hitSlop={Math.max(0, Math.round((MIN_TOUCH_TARGET - size) / 2))}
      style={[
        {
          width: size,
          height: size,
          borderRadius: theme.radius.pill,
          backgroundColor: palette.background,
          borderWidth: palette.border === 'transparent' ? 0 : 1,
          borderColor: palette.border,
          alignItems: 'center',
          justifyContent: 'center',
        },
        press.style,
        disabled ? { opacity: 0.4 } : null,
        style,
      ]}
    >
      <Icon name={icon} size={iconSize ?? Math.round(size * 0.5)} color={palette.icon} />
      {badge && badge > 0 ? (
        <CountBadge count={badge} style={{ position: 'absolute', top: -2, right: -2 }} />
      ) : null}
    </AnimatedPressable>
  );
}
