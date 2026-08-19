import { useState } from 'react';
import { TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Button, Chip, Field, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';
import { createTicket, useSupportCategories } from '@/features/support/useSupport';

/**
 * Opening a ticket: pick a subject area, say what happened, send. Three fields,
 * one screen – support must not feel like filing a form (§68).
 */
export default function NewTicket() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const categories = useSupportCategories();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!session?.user) return;
    setSubmitting(true);
    setError(null);

    const ticketId = await createTicket({
      userId: session.user.id,
      categoryId,
      subject,
      message,
      appVersion: Constants.expoConfig?.version ?? null,
    });

    setSubmitting(false);

    if (!ticketId) {
      setError('Não conseguimos abrir sua solicitação agora. Tente novamente em instantes.');
      return;
    }
    router.replace(`/support/${ticketId}`);
  }

  const inputStyle = {
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.surfacePrimary,
    padding: theme.spacing.lg,
    color: theme.colors.textPrimary,
    fontSize: 16,
  };

  return (
    <Screen
      header={
        <ScreenHeader
          title="Nova solicitação"
          onBack={() => router.back()}
          backIcon="close"
          backLabel="Fechar"
        />
      }
    >
        <View style={{ gap: theme.spacing.md }}>
          <Text variant="captionStrong" color="secondary">
            SOBRE O QUE É?
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {categories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                selected={categoryId === category.id}
                onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
              />
            ))}
          </View>
        </View>

        <Field
          label="Assunto"
          placeholder="Ex.: não consigo exportar meu relatório"
          value={subject}
          onChangeText={setSubject}
          maxLength={140}
        />

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="captionStrong" color="secondary">
            O QUE ACONTECEU?
          </Text>
          <TextInput
            accessibilityLabel="Mensagem"
            placeholder="Conte com suas palavras. Quanto mais detalhes, mais rápido conseguimos ajudar."
            placeholderTextColor={theme.colors.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            textAlignVertical="top"
            style={[inputStyle, { minHeight: 160 }]}
          />
        </View>

        {error ? (
          <Text variant="caption" color="danger">
            {error}
          </Text>
        ) : null}

        <Button
          label="Enviar"
          size="lg"
          fullWidth
          loading={submitting}
          disabled={subject.trim() === '' || message.trim() === ''}
          onPress={handleSubmit}
        />
    </Screen>
  );
}
