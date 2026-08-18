import { View } from 'react-native';
import { Stack } from 'expo-router';
import type { ThemePreference } from '@dinamique/types';
import { Card, Chip, Text, useTheme, useThemePreference } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Escuro' },
  { value: 'system', label: 'Sistema' },
];

/** Light / dark / system, persisted to the profile (§16). */
export default function Appearance() {
  const theme = useTheme();
  const { preference, setPreference } = useThemePreference();
  const { session } = useSession();

  async function choose(next: ThemePreference) {
    setPreference(next);
    if (session?.user) {
      await supabase.from('user_preferences').update({ theme: next }).eq('user_id', session.user.id);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Aparência' }} />
      <View style={{ flex: 1, padding: theme.spacing.xl, backgroundColor: theme.colors.backgroundPrimary }}>
        <Card padding="xl" style={{ gap: theme.spacing.lg }}>
          <Text variant="captionStrong" color="secondary">
            TEMA
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {OPTIONS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={preference === option.value}
                onPress={() => choose(option.value)}
              />
            ))}
          </View>
        </Card>
      </View>
    </>
  );
}
