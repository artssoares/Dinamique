import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Read out as "menos uma unidade de Perfume". */
  label: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * How many of something.
 *
 * Typing "3" into a keyboard is four actions: focus, open the pad, press,
 * dismiss. Counting is one, and it is the one that can be done at a traffic
 * light without looking. The zero state greys the minus rather than hiding it,
 * so the control never changes width as it is used.
 */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  label,
  size = 36,
  style,
}: StepperProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
        style,
      ]}
    >
      <IconButton
        icon="minus"
        label={`Menos uma unidade de ${label}`}
        tone="surface"
        size={size}
        iconSize={16}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
      />

      <Text
        variant="bodyStrong"
        align="center"
        // Fixed width so the row does not jog when 9 becomes 10.
        style={{ minWidth: 28 }}
        accessibilityLabel={`${value} de ${label}`}
      >
        {value}
      </Text>

      <IconButton
        icon="plus"
        label={`Mais uma unidade de ${label}`}
        tone={value > 0 ? 'brand' : 'surface'}
        size={size}
        iconSize={16}
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
      />
    </View>
  );
}
