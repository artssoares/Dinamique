import { Stack } from 'expo-router';
import { useTheme } from '@dinamique/ui';

export default function VehicleLayout() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.backgroundPrimary },
        headerTintColor: theme.colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.colors.backgroundPrimary },
      }}
    />
  );
}
