import { View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { SpacingToken } from '../tokens/index';

export interface CardProps extends ViewProps {
  padding?: SpacingToken;
  elevated?: boolean;
  /** Cards are borderless by default — whitespace does the separating (§14). */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ padding = 'xl', elevated = false, bordered = false, style, ...rest }: CardProps) {
  const theme = useTheme();

  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: elevated ? theme.colors.surfaceElevated : theme.colors.surfacePrimary,
          borderRadius: theme.radius['3xl'],
          padding: theme.spacing[padding],
          borderWidth: bordered ? 1 : 0,
          borderColor: theme.colors.borderSubtle,
        },
        elevated ? theme.elevation.md : null,
        style,
      ]}
    />
  );
}
