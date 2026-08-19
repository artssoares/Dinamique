import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Badge,
  Card,
  EmptyState,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';

interface NotificationRow {
  id: string;
  category: string;
  title: string;
  body: string;
  deep_link: string | null;
  read_at: string | null;
  created_at: string;
}

/** The bell's contents (§58). Tapping opens the thing it is about. */
export default function Notifications() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const [items, setItems] = useState<NotificationRow[]>([]);

  const load = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('user_notifications')
      .select('id, category, title, body, deep_link, read_at, created_at')
      .eq('user_id', session.user.id)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    setItems((data as NotificationRow[] | null) ?? []);
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    if (!session?.user) return;
    await supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', session.user.id)
      .is('read_at', null);
    await load();
  }

  async function open(item: NotificationRow) {
    if (!item.read_at) {
      await supabase
        .from('user_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', item.id);
    }
    void track('notification_opened', { category: item.category });
    if (item.deep_link) router.push(item.deep_link as never);
    else await load();
  }

  const unread = items.filter((item) => item.read_at === null).length;

  return (
    <Screen
      header={
        <ScreenHeader
          title="Notificações"
          onBack={() => router.back()}
          actions={
            unread > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Marcar todas como lidas"
                onPress={markAllRead}
                hitSlop={10}
              >
                <Text variant="captionStrong" color="brand">
                  Marcar todas
                </Text>
              </Pressable>
            ) : null
          }
        />
      }
      scroll={false}
      padding="none"
    >
      <FlatList
        contentContainerStyle={{ gap: theme.spacing.md, flexGrow: 1 }}
        data={items}
        keyExtractor={(item) => item.id}
        onRefresh={load}
        refreshing={false}
        ListEmptyComponent={
          <EmptyState
            iconName="bell"
            title="Nenhuma notificação"
            description="Avisos sobre metas, manutenção e respostas do suporte aparecem aqui."
          />
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => open(item)}>
            <Card
              padding="lg"
              style={{
                gap: theme.spacing.xs,
                // Unread items carry a brand-coloured edge, not a different colour of text.
                borderLeftWidth: item.read_at ? 0 : 3,
                borderLeftColor: theme.colors.brandPrimary,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Badge label={item.category} tone={item.read_at ? 'neutral' : 'brand'} />
                <Text variant="caption" color="muted">
                  {new Date(item.created_at).toLocaleDateString('pt-BR')}
                </Text>
              </View>
              <Text variant="bodyStrong">{item.title}</Text>
              <Text variant="body" color="secondary">
                {item.body}
              </Text>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
