import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../icons/Icon';
import { Text } from './Text';

export interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
  /** Campos opcionais são marcados de forma explícita (§4). */
  optional?: boolean;
  /** Ícone à esquerda, dentro do campo. */
  iconName?: IconName;
  /** Mostra o botão de revelar a senha. Implica `secureTextEntry`. */
  password?: boolean;
}

/**
 * Campo de texto com rótulo.
 *
 * A borda muda de cor no foco: sem isso, em um celular barato com a tela no
 * sol, não dá para saber onde o texto vai cair. Senhas ganham o botão de
 * revelar – errar a senha às cegas é o motivo número um de não conseguir
 * entrar.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  iconName,
  password,
  style,
  onFocus,
  onBlur,
  ...rest
}: FieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const borderColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.brandPrimary
      : theme.colors.borderPrimary;

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

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          minHeight: 54,
          borderRadius: theme.radius.lg,
          borderWidth: 1.5,
          borderColor,
          backgroundColor: theme.colors.surfacePrimary,
          paddingHorizontal: theme.spacing.lg,
        }}
      >
        {iconName ? (
          <Icon
            name={iconName}
            size={18}
            color={focused ? theme.colors.brandPrimary : theme.colors.textMuted}
          />
        ) : null}

        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={theme.colors.textMuted}
          secureTextEntry={password ? !revealed : rest.secureTextEntry}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[
            {
              flex: 1,
              paddingVertical: theme.spacing.md,
              color: theme.colors.textPrimary,
              fontSize: 16,
            },
            style,
          ]}
          {...rest}
        />

        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Esconder senha' : 'Mostrar senha'}
            onPress={() => setRevealed((current) => !current)}
            hitSlop={12}
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} size={18} color={theme.colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

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
