import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '../tokens/index';
import { Text } from './Text';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Describes the whole control to a screen reader. */
  label: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Period switches (Semana / Mês / Ano) were a row of loose chips, which read as
 * four independent buttons rather than one choice. A track with a moving
 * selection says "pick exactly one of these" without a word of explanation.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={[
        {
          flexDirection: 'row',
          padding: 4,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.backgroundSecondary,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: MIN_TOUCH_TARGET - 8,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.pill,
              backgroundColor: selected ? theme.colors.surfaceInverse : 'transparent',
              opacity: pressed && !selected ? 0.6 : 1,
            })}
          >
            <Text
              variant="captionStrong"
              style={{ color: selected ? theme.colors.textOnInverse : theme.colors.textSecondary }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
