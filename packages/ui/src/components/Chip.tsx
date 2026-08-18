import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '../tokens/index';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Pill-shaped quick selection — the fastest way to answer a question (§52). */
export function Chip({ label, selected = false, onPress, disabled, style }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH_TARGET,
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.pill,
          backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surfaceSecondary,
          borderWidth: 1,
          borderColor: selected ? theme.colors.brandPrimary : theme.colors.borderPrimary,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Text variant="captionStrong" color={selected ? 'onBrand' : 'primary'}>
        {label}
      </Text>
    </Pressable>
  );
}
