import { Stack } from 'expo-router';
import { useTheme } from '@dinamique/ui';

export default function SupportLayout() {
  const theme = useTheme();
  return (
    <Stack
      // Each screen draws its own <ScreenHeader>, so the native one is off.
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.backgroundPrimary },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
