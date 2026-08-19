import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Chip, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';

const CONTENT_TYPES = [
  'Uber', 'Motoristas de aplicativo', 'Delivery', 'Carros', 'Motos',
  'Finanças', 'Empreendedorismo', 'Lifestyle', 'Outros',
];

const STATUS_COPY: Record<string, string> = {
  submitted: 'Recebemos sua candidatura.',
  under_review: 'Sua candidatura está em análise.',
  approved: 'Você foi aprovado para o programa de Influencers Dinamique.',
  rejected: 'Sua candidatura não foi aprovada desta vez.',
  suspended: 'Sua participação está suspensa. Fale com o suporte.',
};

/** "Seja um Influencer" (§76–79). One short screen, then a status. */
export default function Influencer() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile } = useSession();

  const [application, setApplication] = useState<{ status: string } | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [followers, setFollowers] = useState('');
  const [contentType, setContentType] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!session?.user) return;
    void supabase
      .from('influencer_applications')
      .select('status')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setApplication(data as { status: string } | null);
        setLoading(false);
      });

    void supabase
      .from('promotion_codes')
      .select('code')
      .eq('owner_user_id', session.user.id)
      .eq('kind', 'influencer')
      .maybeSingle()
      .then(({ data }) => setCode((data?.code as string | undefined) ?? null));
  }, [session?.user?.id]);

  async function submit() {
    if (!session?.user || !contentType) return;
    setSubmitting(true);

    const { error } = await supabase.from('influencer_applications').insert({
      user_id: session.user.id,
      name: profile?.firstName ?? '',
      email: session.user.email ?? '',
      city: city.trim(),
      state: state.trim().toUpperCase(),
      instagram: instagram.trim() || null,
      tiktok: tiktok.trim() || null,
      followers_estimate: followers.trim() === '' ? null : Number(followers),
      content_type: contentType,
      message: message.trim() || null,
      status: 'submitted',
    });

    setSubmitting(false);
    if (!error) {
      void track('influencer_application_submitted', { content_type: contentType });
      setApplication({ status: 'submitted' });
    }
  }

  const inputStyle = {
    height: 50,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderPrimary,
    backgroundColor: theme.colors.surfacePrimary,
    paddingHorizontal: theme.spacing.lg,
    color: theme.colors.textPrimary,
    fontSize: 16,
  };

  if (loading) return null;

  return (
    <Screen
      header={<ScreenHeader title="Seja um Influencer" onBack={() => router.back()} />}
      gap="lg"
    >
        {application ? (
          <Card padding="xl" style={{ gap: theme.spacing.md }}>
            <Badge
              label={application.status}
              tone={
                application.status === 'approved'
                  ? 'success'
                  : application.status === 'rejected' || application.status === 'suspended'
                    ? 'danger'
                    : 'brand'
              }
            />
            <Text variant="subtitle">
              {STATUS_COPY[application.status] ?? 'Sua candidatura está sendo analisada.'}
            </Text>
            {application.status === 'approved' && code ? (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="caption" color="secondary">
                  SEU CÓDIGO
                </Text>
                <Text variant="moneyLarge" color="brand">
                  {code}
                </Text>
              </View>
            ) : null}
          </Card>
        ) : (
          <>
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="titleLg">Seja um Influencer Dinamique</Text>
              <Text variant="body" color="secondary">
                Cria conteúdo para motoristas e entregadores? Conte pra gente. Influencers
                aprovados recebem um código exclusivo e acompanham os resultados por aqui.
              </Text>
            </View>

            <View style={{ gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <TextInput
                  accessibilityLabel="Cidade"
                  placeholder="Cidade"
                  placeholderTextColor={theme.colors.textMuted}
                  value={city}
                  onChangeText={setCity}
                  style={[inputStyle, { flex: 3 }]}
                />
                <TextInput
                  accessibilityLabel="Estado"
                  placeholder="UF"
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={2}
                  autoCapitalize="characters"
                  value={state}
                  onChangeText={setState}
                  style={[inputStyle, { flex: 1 }]}
                />
              </View>

              <TextInput
                accessibilityLabel="Instagram (opcional)"
                placeholder="@instagram (opcional)"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                value={instagram}
                onChangeText={setInstagram}
                style={inputStyle}
              />
              <TextInput
                accessibilityLabel="TikTok (opcional)"
                placeholder="@tiktok (opcional)"
                placeholderTextColor={theme.colors.textMuted}
                autoCapitalize="none"
                value={tiktok}
                onChangeText={setTiktok}
                style={inputStyle}
              />
              <TextInput
                accessibilityLabel="Seguidores aproximados"
                placeholder="Seguidores aproximados (opcional)"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="number-pad"
                value={followers}
                onChangeText={setFollowers}
                style={inputStyle}
              />
            </View>

            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="captionStrong" color="secondary">
                TIPO DE CONTEÚDO
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {CONTENT_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={type}
                    selected={contentType === type}
                    onPress={() => setContentType(type)}
                  />
                ))}
              </View>
            </View>

            <TextInput
              accessibilityLabel="Mensagem (opcional)"
              placeholder="Quer contar mais alguma coisa? (opcional)"
              placeholderTextColor={theme.colors.textMuted}
              value={message}
              onChangeText={setMessage}
              multiline
              textAlignVertical="top"
              style={[inputStyle, { height: 120, paddingTop: theme.spacing.md }]}
            />

            <Button
              label="Quero participar"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={city.trim() === '' || state.trim().length !== 2 || !contentType}
              onPress={submit}
            />
          </>
        )}
    </Screen>
  );
}
