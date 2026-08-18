import { View } from 'react-native';
import { Stack } from 'expo-router';
import { Card, Text, useTheme } from '@dinamique/ui';

export interface ComingSoonProps {
  title: string;
  /** What this screen will do, stated plainly. */
  description: string;
  /** Which build phase covers it — see IMPLEMENTATION.md. */
  phase: string;
}

/**
 * A route that exists in the navigation map but is not built yet.
 *
 * This is deliberate and visible: a screen that pretends to work is worse than
 * one that says it does not (§131). Every one of these is listed in
 * IMPLEMENTATION.md with the phase that delivers it.
 */
export function ComingSoon({ title, description, phase }: ComingSoonProps) {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen options={{ title }} />
      <View style={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'center' }}>
        <Card padding="xl" style={{ gap: theme.spacing.md }}>
          <Text variant="overline" color="accent">
            AINDA NÃO DISPONÍVEL
          </Text>
          <Text variant="title">{title}</Text>
          <Text variant="body" color="secondary">
            {description}
          </Text>
          <Text variant="caption" color="muted">
            Previsto para a {phase}.
          </Text>
        </Card>
      </View>
    </>
  );
}
