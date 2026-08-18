import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { FEATURES, hasFeature, type Feature } from '@dinamique/business-logic';
import { formatCents } from '@dinamique/utils';
import { Badge, Button, Card, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

const FEATURE_LABELS: Partial<Record<Feature, string>> = {
  history_unlimited: 'Histórico completo, sem limite de dias',
  insights_advanced: 'Insights aprofundados',
  benchmark: 'Comparação anônima com motoristas parecidos',
  projections: 'Projeção de quanto você fecha o mês',
  export_xlsx: 'Exportar em Excel',
  export_csv: 'Exportar em CSV',
  multi_vehicle: 'Mais de um veículo',
  recurring_costs: 'Custos fixos com rateio automático',
};

/** Plano e assinatura (§56, §57). */
export default function Plan() {
  const theme = useTheme();
  const router = useRouter();
  const { session, plan, isTrial } = useSession();

  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    void supabase
      .from('current_plans')
      .select('expires_at, source')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setExpiresAt((data?.expires_at as string | null) ?? null);
        setSource((data?.source as string | null) ?? null);
      });

    void supabase
      .from('discount_benefits')
      .select('amount')
      .eq('user_id', session.user.id)
      .eq('status', 'granted')
      .maybeSingle()
      .then(({ data }) => setDiscount((data?.amount as number | undefined) ?? null));

    void supabase
      .from('plans')
      .select('price')
      .eq('code', 'pro')
      .maybeSingle()
      .then(({ data }) => setPrice((data?.price as number | undefined) ?? null));
  }, [session?.user?.id]);

  const daysLeft =
    expiresAt !== null
      ? Math.max(0, Math.ceil((Date.parse(expiresAt) - Date.now()) / 86_400_000))
      : null;

  const proFeatures = FEATURES.filter(
    (feature) => !hasFeature('free', feature) && FEATURE_LABELS[feature],
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Plano e assinatura' }} />
      <ScrollView
        style={{ backgroundColor: theme.colors.backgroundPrimary }}
        contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}
      >
        <Card padding="xl" style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="titleLg">{plan === 'pro' ? 'Dinamique Pro' : 'Dinamique Free'}</Text>
            <Badge
              label={plan === 'pro' ? (isTrial ? 'Teste' : 'Ativo') : 'Free'}
              tone={plan === 'pro' ? 'brand' : 'neutral'}
            />
          </View>

          {isTrial && daysLeft !== null ? (
            <Text variant="body" color="secondary">
              {daysLeft === 0
                ? 'Seu período de teste termina hoje.'
                : daysLeft === 1
                  ? 'Falta 1 dia do seu período de teste.'
                  : `Faltam ${daysLeft} dias do seu período de teste.`}{' '}
              Depois disso você continua usando o Dinamique no plano Free — nada é bloqueado de
              uma hora para outra.
            </Text>
          ) : plan === 'pro' ? (
            <Text variant="body" color="secondary">
              {source === 'courtesy' || source === 'partnership'
                ? 'Seu acesso Pro foi concedido pela equipe Dinamique.'
                : 'Sua assinatura Pro está ativa.'}
              {daysLeft !== null ? ` Válido por mais ${daysLeft} dias.` : ''}
            </Text>
          ) : (
            <Text variant="body" color="secondary">
              Você tem acesso a jornadas, ganhos, gastos, abastecimento, meta do dia e suporte. O
              Pro adiciona profundidade.
            </Text>
          )}
        </Card>

        {discount ? (
          <Card padding="lg" style={{ backgroundColor: theme.colors.brandPrimarySubtle }}>
            <Text variant="bodyStrong" color="brand">
              Você tem {formatCents(discount)} de desconto
            </Text>
            <Text variant="caption" color="secondary">
              O desconto é aplicado automaticamente na sua primeira cobrança Pro.
            </Text>
          </Card>
        ) : null}

        {plan === 'free' ? (
          <Card padding="xl" style={{ gap: theme.spacing.md }}>
            <Text variant="subtitle">O que vem no Pro</Text>
            {proFeatures.map((feature) => (
              <Text key={feature} variant="body" color="secondary">
                • {FEATURE_LABELS[feature]}
              </Text>
            ))}
            {price !== null ? (
              <Text variant="moneyMedium" style={{ marginTop: theme.spacing.sm }}>
                {formatCents(price)} por mês
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/*
          Nenhum meio de pagamento está integrado ainda. Um botão "Assinar" que
          não cobra nada seria pior do que a ausência dele (§131), então a tela
          diz a verdade e oferece o caminho que existe de fato.
        */}
        <Card padding="lg" style={{ gap: theme.spacing.sm }}>
          <Text variant="bodyStrong">Assinatura ainda não disponível</Text>
          <Text variant="caption" color="secondary">
            O pagamento dentro do aplicativo ainda não está no ar. Quer o Pro agora? Fale com a
            gente pelo suporte que a equipe libera seu acesso.
          </Text>
        </Card>

        <Button
          label="Falar com o suporte"
          variant={plan === 'free' ? 'primary' : 'ghost'}
          size="lg"
          fullWidth
          onPress={() => router.push('/support/new')}
        />
      </ScrollView>
    </>
  );
}
