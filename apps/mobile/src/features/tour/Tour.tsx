import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button, Card, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

interface TourStep {
  id: string;
  title: string;
  description: string;
}

/**
 * Tour do produto (§23).
 *
 * O conteúdo vem do banco (`tour_steps`), editável pelo Admin — texto de
 * apresentação muda com frequência e não deveria exigir uma nova versão do
 * aplicativo na loja.
 *
 * Aparece uma vez, depois do onboarding. "Pular" e terminar têm o mesmo efeito:
 * quem pulou não quer ver de novo, e insistir seria desrespeitoso.
 */
export function Tour() {
  const theme = useTheme();
  const { session, profile, refresh } = useSession();

  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Só depois do onboarding, e só para quem ainda não viu.
    if (!session?.user || !profile) return;
    if (profile.onboardingCompletedAt === null) return;
    if (profile.tourCompletedAt !== null) return;

    void supabase
      .from('tour_steps')
      .select('id, title, description')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        const rows = (data as TourStep[] | null) ?? [];
        setSteps(rows);
        setVisible(rows.length > 0);
      });
  }, [session?.user?.id, profile?.onboardingCompletedAt, profile?.tourCompletedAt]);

  async function finish() {
    setVisible(false);
    if (!session?.user) return;
    await supabase
      .from('profiles')
      .update({ tour_completed_at: new Date().toISOString() })
      .eq('id', session.user.id);
    await refresh();
  }

  const step = steps[index];
  if (!visible || !step) return null;

  const isLast = index === steps.length - 1;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.overlay,
          justifyContent: 'flex-end',
          padding: theme.spacing.xl,
        }}
      >
        <Card padding="xl" elevated style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
            {steps.map((_, position) => (
              <View
                key={position}
                style={{
                  flex: 1,
                  height: 3,
                  borderRadius: theme.radius.pill,
                  backgroundColor:
                    position <= index ? theme.colors.brandPrimary : theme.colors.backgroundSecondary,
                }}
              />
            ))}
          </View>

          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="title">{step.title}</Text>
            <Text variant="body" color="secondary">
              {step.description}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' }}>
            <Button
              label={isLast ? 'Começar' : 'Próximo'}
              onPress={() => (isLast ? finish() : setIndex(index + 1))}
            />
            {index > 0 ? (
              <Button label="Voltar" variant="ghost" size="sm" onPress={() => setIndex(index - 1)} />
            ) : null}

            <Pressable
              accessibilityRole="button"
              onPress={finish}
              style={{ marginLeft: 'auto', padding: theme.spacing.sm }}
            >
              <Text variant="caption" color="secondary">
                Pular
              </Text>
            </Pressable>
          </View>
        </Card>
      </View>
    </Modal>
  );
}
