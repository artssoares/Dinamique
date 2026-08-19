import { Pressable, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { Text } from './Text';

export interface AmountInputProps {
  value: string;
  onChangeText: (value: string) => void;
  label: string;
  hint?: string;
  error?: string | null;
  placeholder?: string;
  /** Tap-to-fill amounts shown under the field, already formatted. */
  quickValues?: { label: string; value: string }[];
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The money field.
 *
 * Typing an amount is the single most repeated action in the app, so it gets a
 * field of its own: an anchored R$, figures at display size, and optional
 * one-tap amounts. The keyboard is `decimal-pad` – a driver holding a phone at
 * a traffic light should not have to hunt for the numbers.
 */
export function AmountInput({
  value,
  onChangeText,
  label,
  hint,
  error,
  placeholder = '0,00',
  quickValues,
  autoFocus,
  style,
}: AmountInputProps) {
  const theme = useTheme();
  const { scale } = useResponsive();

  return (
    <View style={[{ gap: theme.spacing.sm }, style]}>
      <Text variant="captionStrong" color="secondary">
        {label.toUpperCase()}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.surfacePrimary,
          borderWidth: 1.5,
          borderColor: error ? theme.colors.danger : theme.colors.borderPrimary,
        }}
      >
        <Text variant="moneyMedium" color="secondary">
          R$
        </Text>
        <TextInput
          accessibilityLabel={label}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="decimal-pad"
          inputMode="decimal"
          value={value}
          onChangeText={onChangeText}
          autoFocus={autoFocus}
          style={{
            flex: 1,
            fontSize: scale(32, { min: 26, max: 38 }),
            fontWeight: '700',
            color: theme.colors.textPrimary,
            paddingVertical: theme.spacing.xs,
          }}
        />
      </View>

      {quickValues && quickValues.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {quickValues.map((quick) => (
            <Pressable
              key={quick.value}
              accessibilityRole="button"
              accessibilityLabel={`Usar ${quick.label}`}
              onPress={() => onChangeText(quick.value)}
              style={({ pressed }) => ({
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.backgroundSecondary,
                borderWidth: 1,
                borderColor: theme.colors.borderSubtle,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text variant="captionStrong" color="secondary">
                {quick.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

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
