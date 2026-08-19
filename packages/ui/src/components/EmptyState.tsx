import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../icons/Icon';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Drawn inside a soft circle above the title. */
  iconName?: IconName;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Shown instead of a dashboard full of zeros (§112). A zero is a claim about
 * the data; "you haven't recorded anything yet" is the truth.
 */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  iconName,
  icon,
  style,
}: EmptyStateProps) {
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
      {icon ??
        (iconName ? (
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.backgroundSecondary,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: theme.spacing.xs,
            }}
          >
            <Icon name={iconName} size={26} color={theme.colors.textSecondary} />
          </View>
        ) : null)}
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
