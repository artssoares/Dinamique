import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.js';
import { Button } from './Button.js';
import { Text } from './Text.js';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shown instead of a dashboard full of zeros (§112). A zero is a claim about
 * the data; "you haven't recorded anything yet" is the truth.
 */
export function EmptyState({ title, description, actionLabel, onAction, icon, style }: EmptyStateProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        {
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingVertical: theme.spacing['4xl'],
          paddingHorizontal: theme.spacing.xl,
        },
        style,
      ]}
    >
      {icon}
      <Text variant="subtitle" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="body" color="secondary" align="center">
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={{ marginTop: theme.spacing.sm }} />
      ) : null}
    </View>
  );
}
