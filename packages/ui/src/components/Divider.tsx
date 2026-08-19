import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export interface DividerProps {
  /** 'strong' for a real separation, 'subtle' between rows of one group. */
  tone?: 'subtle' | 'strong';
  style?: StyleProp<ViewStyle>;
}

export function Divider({ tone = 'subtle', style }: DividerProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          height: 1,
          backgroundColor: tone === 'strong' ? theme.colors.borderPrimary : theme.colors.borderSubtle,
        },
        style,
      ]}
    />
  );
}
