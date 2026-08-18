import { Stack } from 'expo-router';
import { useTheme } from '@dinamique/ui';

export default function SupportLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.backgroundPrimary },
        headerTintColor: theme.colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.backgroundPrimary },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Suporte' }} />
      <Stack.Screen name="new" options={{ title: 'Nova solicitação', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Atendimento' }} />
    </Stack>
  );
}
