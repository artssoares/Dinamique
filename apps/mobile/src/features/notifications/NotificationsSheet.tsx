import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Badge,
  Card,
  EmptyState,
  Reveal,
  Sheet,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';
import { useNotificationCounts } from '@/hooks/useNotifications';

interface NotificationRow {
  id: string;
  category: string;
  title: string;
  body: string;
  deep_link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationsSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The bell's contents (§58).
 *
 * A sheet rather than a pushed screen: notifications are a glance, not a
 * destination, and pushing a whole screen for them meant leaving whatever you
 * were doing and finding your way back.
 *
 * "Limpar" dismisses rather than deletes. The message stays in the database
 * for support and analytics, which is where "did the reminder land?" gets
 * answered, and the driver still gets an empty list.
 */
export function NotificationsSheet({ visible, onClose }: NotificationsSheetProps) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const { refresh: refreshCounts } = useNotificationCounts();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    const { data } = await supabase
      .from('user_notifications')
      .select('id, category, title, body, deep_link, read_at, created_at')
      .eq('user_id', session.user.id)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(50);
    setItems((data as NotificationRow[] | null) ?? []);
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    if (visible) void load();
  }, [load, visible]);

  async function dismissAll() {
    if (!session?.user) return;
    const now = new Date().toISOString();
    // Optimistic: the list empties immediately and the request follows.
    setItems([]);
    await supabase
      .from('user_notifications')
      .update({ dismissed_at: now })
      .eq('user_id', session.user.id)
      .is('dismissed_at', null);
    await refreshCounts();
  }

  async function open(item: NotificationRow) {
    if (!item.read_at) {
      await supabase
        .from('user_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', item.id);
      await refreshCounts();
    }
    void track('notification_opened', { category: item.category });
    if (item.deep_link) {
      onClose();
      router.push(item.deep_link as never);
    } else {
      await load();
    }
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Notificações"
      description={items.length > 0 ? undefined : 'Avisos de meta, manutenção e suporte chegam aqui.'}
      action={
        items.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Limpar todas as notificações"
            onPress={dismissAll}
            hitSlop={10}
            style={({ pressed }) => ({
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.backgroundSecondary,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="captionStrong" color="brand">
              Limpar
            </Text>
          </Pressable>
        ) : null
      }
    >
      {loading && items.length === 0 ? null : items.length === 0 ? (
        <EmptyState
          iconName="bell"
          title="Tudo limpo por aqui"
          description="Quando houver algo para avisar, aparece nesta lista."
        />
      ) : (
        items.map((item, index) => (
          <Reveal key={item.id} delay={index * 45}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.body}`}
              onPress={() => open(item)}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <Card
                padding="lg"
                bordered
                style={{
                  gap: theme.spacing.xs,
                  // Unread items carry a brand edge, not a different text colour.
                  borderLeftWidth: item.read_at ? 1 : 3,
                  borderLeftColor: item.read_at
                    ? theme.colors.borderSubtle
                    : theme.colors.brandPrimary,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Badge label={item.category} tone={item.read_at ? 'neutral' : 'brand'} />
                  <Text variant="caption" color="muted">
                    {formatWhen(item.created_at)}
                  </Text>
                </View>
                <Text variant="bodyStrong">{item.title}</Text>
                <Text variant="body" color="secondary">
                  {item.body}
                </Text>
              </Card>
            </Pressable>
          </Reveal>
        ))
      )}
    </Sheet>
  );
}

function formatWhen(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}
