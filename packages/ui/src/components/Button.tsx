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
import { useTheme } from '../theme/ThemeProvider.js';
import { MIN_TOUCH_TARGET } from '../tokens/index.js';
import { Text } from './Text.js';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<ButtonSize, { height: number; paddingHorizontal: number; variant: 'body' | 'bodyStrong' | 'subtitle' }> = {
  sm: { height: MIN_TOUCH_TARGET, paddingHorizontal: 16, variant: 'bodyStrong' },
  md: { height: 52, paddingHorizontal: 20, variant: 'bodyStrong' },
  lg: { height: 58, paddingHorizontal: 24, variant: 'subtitle' },
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const sizing = SIZES[size];
  const isDisabled = disabled === true || loading;

  const surfaces: Record<ButtonVariant, { background: string; border: string; text: Parameters<typeof Text>[0]['color'] }> = {
    primary: { background: theme.colors.brandPrimary, border: 'transparent', text: 'onBrand' },
    secondary: { background: theme.colors.brandPrimarySubtle, border: 'transparent', text: 'brand' },
    ghost: { background: 'transparent', border: theme.colors.borderPrimary, text: 'primary' },
    danger: { background: theme.colors.danger, border: 'transparent', text: 'onBrand' },
  };

  const surface = surfaces[variant];

  const buildStyle = useCallback(
    ({ pressed }: { pressed: boolean }): StyleProp<ViewStyle> => [
      styles.base,
      {
        height: sizing.height,
        paddingHorizontal: sizing.paddingHorizontal,
        borderRadius: theme.radius.lg,
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
    [fullWidth, isDisabled, sizing, style, surface, theme.radius.lg, variant],
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
        <ActivityIndicator
          color={variant === 'primary' || variant === 'danger' ? theme.colors.textOnBrand : theme.colors.brandPrimary}
        />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text variant={sizing.variant} color={surface.text}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
