import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { STATUS_LABELS, isOpen } from '@dinamique/business-logic';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  useTheme,
} from '@dinamique/ui';
import { useTickets, type TicketSummary } from '@/features/support/useSupport';

/**
 * Support inbox. The ticket number exists but is deliberately quiet – a driver
 * should see their question, not a reference code (§69).
 */
export default function SupportInbox() {
  const theme = useTheme();
  const router = useRouter();
  const { tickets, loading, refresh } = useTickets();

  const header = (
    <ScreenHeader
      title="Suporte"
      subtitle="Fale com a equipe sem sair do aplicativo"
      onBack={() => router.back()}
    />
  );

  if (loading) {
    return (
      <Screen header={header} gap="md">
        <Skeleton height={92} radius={theme.radius['2xl']} />
        <Skeleton height={92} radius={theme.radius['2xl']} />
      </Screen>
    );
  }

  return (
    <Screen
      header={header}
      scroll={false}
      padding="none"
      footer={
        tickets.length > 0 ? (
          <Button
            label="Abrir nova solicitação"
            iconName="plus"
            fullWidth
            onPress={() => router.push('/support/new')}
          />
        ) : null
      }
    >
      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        onRefresh={refresh}
        refreshing={false}
        contentContainerStyle={{ gap: theme.spacing.md, flexGrow: 1 }}
        ListEmptyComponent={
          <EmptyState
            iconName="support"
            title="Nenhuma conversa por aqui"
            description="Precisa de ajuda? Fale com a equipe Dinamique sem sair do aplicativo."
            actionLabel="Abrir solicitação"
            onAction={() => router.push('/support/new')}
          />
        }
        renderItem={({ item }) => (
          <TicketRow ticket={item} onPress={() => router.push(`/support/${item.id}`)} />
        )}
      />
    </Screen>
  );
}

function TicketRow({ ticket, onPress }: { ticket: TicketSummary; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card padding="lg" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Badge
            label={STATUS_LABELS[ticket.status]}
            tone={
              ticket.status === 'resolved' || ticket.status === 'closed'
                ? 'success'
                : ticket.status === 'awaiting_user'
                  ? 'accent'
                  : 'brand'
            }
          />
          {ticket.hasUnread ? (
            <View
              accessibilityLabel="Nova resposta"
              style={{
                width: 10,
                height: 10,
                borderRadius: theme.radius.pill,
                backgroundColor: theme.colors.brandSecondary,
              }}
            />
          ) : null}
        </View>

        <Text variant="bodyStrong">{ticket.subject}</Text>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {ticket.categoryName ? (
            <Text variant="caption" color="secondary">
              {ticket.categoryName}
            </Text>
          ) : null}
          <Text variant="caption" color="muted">
            {isOpen(ticket.status) ? 'Em aberto' : 'Encerrado'} · {formatWhen(ticket.lastMessageAt)}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return 'agora';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  if (diffMinutes < 1440) return `há ${Math.floor(diffMinutes / 60)} h`;
  return date.toLocaleDateString('pt-BR');
}
