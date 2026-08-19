import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../icons/Icon';
import { MIN_TOUCH_TARGET } from '../tokens/index';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  iconName?: IconName;
  /** Multi-select chips show a tick when on, so selection is not colour-only. */
  multiple?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Pill-shaped quick selection — the fastest way to answer a question (§52). */
export function Chip({
  label,
  selected = false,
  onPress,
  disabled,
  iconName,
  multiple = false,
  style,
}: ChipProps) {
  const theme = useTheme();
  const content = selected ? theme.colors.textOnBrand : theme.colors.textPrimary;

  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'button'}
      accessibilityState={multiple ? { checked: selected, disabled } : { selected, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: MIN_TOUCH_TARGET,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radius.pill,
          backgroundColor: selected ? theme.colors.brandPrimary : theme.colors.surfacePrimary,
          borderWidth: 1,
          borderColor: selected ? theme.colors.brandPrimary : theme.colors.borderPrimary,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
        {iconName ? <Icon name={iconName} size={16} color={content} /> : null}
        <Text variant="captionStrong" style={{ color: content }}>
          {label}
        </Text>
        {multiple && selected ? <Icon name="check" size={14} color={content} /> : null}
      </View>
    </Pressable>
  );
}
