import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface SectionHeaderProps {
  title: string;
  /** Right-hand affordance, e.g. "Ver tudo". */
  actionLabel?: string;
  onAction?: () => void;
  right?: ReactNode;
}

/** The label above a group of cards or rows. */
export function SectionHeader({ title, actionLabel, onAction, right }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
      }}
    >
      <Text variant="subtitle">{title}</Text>
      {right ??
        (actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={onAction}
            hitSlop={10}
          >
            <Text variant="captionStrong" color="brand">
              {actionLabel}
            </Text>
          </Pressable>
        ) : null)}
    </View>
  );
}
