import { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../icons/Icon';
import { MIN_TOUCH_TARGET } from '../tokens/index';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  /** Icon drawn from the set, tinted to match the label. */
  iconName?: IconName;
  iconPosition?: 'leading' | 'trailing';
  /** Escape hatch for a custom node; `iconName` covers the normal case. */
  icon?: React.ReactNode;
  /** Fully rounded. The default is the 16dp radius the rest of the UI uses. */
  pill?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<
  ButtonSize,
  { height: number; paddingHorizontal: number; variant: 'body' | 'bodyStrong' | 'subtitle'; icon: number }
> = {
  sm: { height: MIN_TOUCH_TARGET, paddingHorizontal: 16, variant: 'bodyStrong', icon: 16 },
  md: { height: 52, paddingHorizontal: 20, variant: 'bodyStrong', icon: 18 },
  lg: { height: 58, paddingHorizontal: 24, variant: 'subtitle', icon: 20 },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  iconName,
  iconPosition = 'leading',
  icon,
  pill = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const sizing = SIZES[size];
  const isDisabled = disabled === true || loading;

  const surfaces: Record<
    ButtonVariant,
    { background: string; border: string; text: Parameters<typeof Text>[0]['color']; content: string }
  > = {
    primary: {
      background: theme.colors.brandPrimary,
      border: 'transparent',
      text: 'onBrand',
      content: theme.colors.textOnBrand,
    },
    secondary: {
      background: theme.colors.brandPrimarySubtle,
      border: 'transparent',
      text: 'brand',
      content: theme.colors.brandPrimary,
    },
    ghost: {
      background: 'transparent',
      border: theme.colors.borderPrimary,
      text: 'primary',
      content: theme.colors.textPrimary,
    },
    danger: {
      background: theme.colors.danger,
      border: 'transparent',
      text: 'onBrand',
      content: theme.colors.textOnBrand,
    },
    inverse: {
      background: theme.colors.surfaceInverse,
      border: 'transparent',
      text: 'primary',
      content: theme.colors.textOnInverse,
    },
  };

  const surface = surfaces[variant];

  const buildStyle = useCallback(
    ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> => [
      styles.base,
      {
        height: sizing.height,
        paddingHorizontal: sizing.paddingHorizontal,
        borderRadius: pill ? theme.radius.pill : theme.radius.lg,
        backgroundColor: surface.background,
        borderWidth: variant === 'ghost' ? 1 : 0,
        borderColor: surface.border,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        // Pressed state is a subtle scale + fade rather than a colour jump.
        opacity: isDisabled ? 0.45 : pressed ? 0.85 : 1,
        transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
      },
      style,
    ],
    [fullWidth, isDisabled, pill, sizing, style, surface, theme.radius, variant],
  );

  const glyph = iconName ? (
    <Icon name={iconName} size={sizing.icon} color={surface.content} />
  ) : (
    icon
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      style={buildStyle}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={surface.content} />
      ) : (
        <View style={styles.content}>
          {iconPosition === 'leading' ? glyph : null}
          <Text variant={sizing.variant} color={surface.text} style={variant === 'inverse' ? { color: surface.content } : undefined}>
            {label}
          </Text>
          {iconPosition === 'trailing' ? glyph : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
