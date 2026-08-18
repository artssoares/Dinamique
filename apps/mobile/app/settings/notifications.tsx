import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { Stack } from 'expo-router';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from '@dinamique/types';
import { Card, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { disablePush, registerForPush } from '@/features/notifications/push';

const LABELS: Record<NotificationCategory, string> = {
  support: 'Suporte',
  goals: 'Metas',
  maintenance: 'Manutenção',
  free_flow: 'Free Flow',
  fines: 'Multas',
  subscription: 'Assinatura',
  system: 'Sistema',
  news: 'Novidades',
  insights: 'Insights',
  summaries: 'Resumos',
  promotions: 'Promoções',
};

interface PrefRow {
  category: NotificationCategory;
  in_app: boolean;
  push: boolean;
}

/** Preferências por categoria (§58) e ativação do Push (§59). */
export default function NotificationSettings() {
  const theme = useTheme();
  const { session } = useSession();

  const [prefs, setPrefs] = useState<PrefRow[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user) return;
    const [prefsResult, userPrefs] = await Promise.all([
      supabase
        .from('notification_preferences')
        .select('category, in_app, push')
        .eq('user_id', session.user.id),
      supabase
        .from('user_preferences')
        .select('push_enabled')
        .eq('user_id', session.user.id)
        .maybeSingle(),
    ]);
    setPrefs((prefsResult.data as PrefRow[] | null) ?? []);
    setPushEnabled(Boolean(userPrefs.data?.push_enabled));
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePush(value: boolean) {
    if (!session?.user) return;
    if (value) {
      const token = await registerForPush(session.user.id);
      // Sem permissão concedida, o switch volta sozinho — sem alerta acusatório.
      setPushEnabled(token !== null);
    } else {
      await disablePush(session.user.id);
      setPushEnabled(false);
    }
  }

  async function toggleCategory(category: NotificationCategory, field: 'in_app' | 'push', value: boolean) {
    if (!session?.user) return;
    setPrefs((current) =>
      current.map((pref) => (pref.category === category ? { ...pref, [field]: value } : pref)),
    );
    await supabase
      .from('notification_preferences')
      .update({ [field]: value })
      .eq('user_id', session.user.id)
      .eq('category', category);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Notificações' }} />
      <ScrollView
        style={{ backgroundColor: theme.colors.backgroundPrimary }}
        contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg }}
      >
        <Card padding="xl" style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="bodyStrong">Notificações no celular</Text>
            <Switch value={pushEnabled} onValueChange={togglePush} />
          </View>
          <Text variant="caption" color="muted">
            Avisos aparecem dentro do aplicativo mesmo com isso desligado.
          </Text>
        </Card>

        <Text variant="captionStrong" color="secondary">
          O QUE VOCÊ QUER RECEBER
        </Text>

        <Card padding="none" style={{ overflow: 'hidden' }}>
          {NOTIFICATION_CATEGORIES.map((category, index) => {
            const pref = prefs.find((p) => p.category === category);
            return (
              <View
                key={category}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: theme.spacing.md,
                  paddingHorizontal: theme.spacing.xl,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.borderSubtle,
                }}
              >
                <Text variant="body">{LABELS[category]}</Text>
                <Switch
                  value={pref?.in_app ?? true}
                  onValueChange={(value) => toggleCategory(category, 'in_app', value)}
                />
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </>
  );
}
