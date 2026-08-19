import { TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
  /** Campos opcionais são marcados de forma explícita (§4). */
  optional?: boolean;
}

/**
 * Campo de texto com rótulo. Existe para que nenhuma tela precise repetir o
 * mesmo bloco de estilo — e para que "opcional" apareça sempre do mesmo jeito.
 */
export function Field({ label, hint, error, optional, style, ...rest }: FieldProps) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs, alignItems: 'baseline' }}>
        <Text variant="captionStrong" color="secondary">
          {label.toUpperCase()}
        </Text>
        {optional ? (
          <Text variant="caption" color="muted">
            opcional
          </Text>
        ) : null}
      </View>

      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.colors.textMuted}
        style={[
          {
            minHeight: 56,
            borderRadius: theme.radius['2xl'],
            borderWidth: 1,
            borderColor: error ? theme.colors.danger : theme.colors.borderSubtle,
            backgroundColor: theme.colors.surfaceSecondary,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.md,
            color: theme.colors.textPrimary,
            fontFamily: theme.fontFamily,
            fontSize: 16,
          },
          style,
        ]}
        {...rest}
      />

      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
