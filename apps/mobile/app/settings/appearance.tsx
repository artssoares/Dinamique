import { useRouter } from 'expo-router';
import type { ThemePreference } from '@dinamique/types';
import {
  Card,
  ListRow,
  Screen,
  ScreenHeader,
  Text,
  useThemePreference,
  type IconName,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

const OPTIONS: { value: ThemePreference; label: string; description: string; icon: IconName }[] = [
  { value: 'light', label: 'Claro', description: 'Fundo branco o tempo todo', icon: 'sun' },
  { value: 'dark', label: 'Escuro', description: 'Melhor para dirigir à noite', icon: 'moon' },
  {
    value: 'system',
    label: 'Igual ao celular',
    description: 'Muda sozinho com o seu aparelho',
    icon: 'settings',
  },
];

/** Light / dark / system, persisted to the profile (§16). */
export default function Appearance() {
  const router = useRouter();
  const { preference, setPreference } = useThemePreference();
  const { session } = useSession();

  async function choose(next: ThemePreference) {
    setPreference(next);
    if (session?.user) {
      await supabase.from('user_preferences').update({ theme: next }).eq('user_id', session.user.id);
    }
  }

  return (
    <Screen
      header={<ScreenHeader title="Aparência" onBack={() => router.back()} />}
      gap="lg"
    >
      <Card padding="none" style={{ overflow: 'hidden' }}>
        {OPTIONS.map((option, index) => (
          <ListRow
            key={option.value}
            first={index === 0}
            icon={option.icon}
            iconTone={preference === option.value ? 'brand' : 'neutral'}
            label={option.label}
            description={option.description}
            showChevron={false}
            onPress={() => choose(option.value)}
            right={
              preference === option.value ? (
                <Text variant="captionStrong" color="brand">
                  Em uso
                </Text>
              ) : null
            }
          />
        ))}
      </Card>

      <Text variant="caption" color="muted">
        O tema escuro usa cinzas bem escuros em vez de preto puro, para o texto não brilhar demais
        no escuro do carro.
      </Text>
    </Screen>
  );
}
