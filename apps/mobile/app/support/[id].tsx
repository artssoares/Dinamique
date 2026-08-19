import { useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Icon, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';
import { useTicketConversation, type TicketMessage } from '@/features/support/useSupport';

/**
 * The conversation. Deliberately shaped like a chat rather than a ticket
 * thread — a driver already knows how to use this (§70).
 */
export default function TicketConversation() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { messages, sendMessage } = useTicketConversation(String(id));
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!session?.user || draft.trim() === '') return;
    setSending(true);
    const body = draft;
    setDraft('');
    await sendMessage(body, session.user.id);
    setSending(false);
  }

  return (
    <Screen
      header={<ScreenHeader title="Atendimento" onBack={() => router.back()} />}
      scroll={false}
      padding="none"
      footer={
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
          <TextInput
          accessibilityLabel="Escreva sua mensagem"
          placeholder="Escreva sua mensagem"
          placeholderTextColor={theme.colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
            style={{
              flex: 1,
              maxHeight: 120,
              minHeight: 46,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.backgroundSecondary,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              paddingBottom: theme.spacing.md,
              color: theme.colors.textPrimary,
              fontSize: 15,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            disabled={draft.trim() === '' || sending}
            onPress={handleSend}
            style={{
              width: 46,
              height: 46,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.brandPrimary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: draft.trim() === '' || sending ? 0.45 : 1,
            }}
          >
            <Icon name="arrowUpRight" size={20} color={theme.colors.textOnBrand} />
          </Pressable>
        </View>
      }
    >
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: theme.spacing.lg, paddingVertical: theme.spacing.lg }}
        renderItem={({ item }) => <MessageBubble message={item} />}
      />
    </Screen>
  );
}

function MessageBubble({ message }: { message: TicketMessage }) {
  const theme = useTheme();
  const isUser = message.authorKind === 'user';

  return (
    <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start', gap: theme.spacing.xs }}>
      <Text variant="overline" color="muted">
        {isUser ? 'VOCÊ' : 'DINAMIQUE'} · {formatTime(message.createdAt)}
      </Text>
      <View
        style={{
          maxWidth: '85%',
          padding: theme.spacing.lg,
          borderRadius: theme.radius.xl,
          // The tail corner marks who is speaking without needing a label.
          borderBottomRightRadius: isUser ? theme.radius.sm : theme.radius.xl,
          borderBottomLeftRadius: isUser ? theme.radius.xl : theme.radius.sm,
          backgroundColor: isUser ? theme.colors.brandPrimary : theme.colors.surfacePrimary,
        }}
      >
        <Text variant="body" color={isUser ? 'onBrand' : 'primary'}>
          {message.body}
        </Text>
      </View>
    </View>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
