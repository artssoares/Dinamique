import { Text as RNText, type StyleProp, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.js';
import type { TypographyToken } from '../tokens/index.js';

type ColorRole =
  | 'primary'
  | 'secondary'
  | 'muted'
  | 'inverse'
  | 'onBrand'
  | 'brand'
  | 'accent'
  | 'success'
  | 'danger'
  | 'warning';

export interface TextProps extends RNTextProps {
  variant?: TypographyToken;
  color?: ColorRole;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

/**
 * Every string in the app renders through here, so type and colour always come
 * from tokens. `color` names a ROLE, not a hue — the semantic roles resolve to
 * the accessible `*Text` tokens rather than the vivid fill colours.
 */
export function Text({ variant = 'body', color = 'primary', align, style, ...rest }: TextProps) {
  const theme = useTheme();

  const colorMap: Record<ColorRole, string> = {
    primary: theme.colors.textPrimary,
    secondary: theme.colors.textSecondary,
    muted: theme.colors.textMuted,
    inverse: theme.colors.textInverse,
    onBrand: theme.colors.textOnBrand,
    brand: theme.colors.brandPrimary,
    accent: theme.colors.brandSecondary,
    success: theme.colors.successText,
    danger: theme.colors.dangerText,
    warning: theme.colors.warningText,
  };

  return (
    <RNText
      {...rest}
      style={[theme.typography[variant] as TextStyle, { color: colorMap[color], textAlign: align }, style]}
    />
  );
}
