import { Stack } from 'expo-router';
import { useTheme } from '@dinamique/ui';

export default function CostsLayout() {
  const theme = useTheme();
  return (
    <Stack
      // Each screen draws its own <ScreenHeader>, so the native one is off.
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.backgroundPrimary },
        animation: 'slide_from_right',
        animationDuration: 300,
      }}
    />
  );
}
