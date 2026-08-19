import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { BillingInterval } from '@dinamique/billing';
import { annualSavings, monthlyEquivalent } from '@dinamique/billing';
import { FEATURES, hasFeature, type Feature } from '@dinamique/business-logic';
import { formatCents, formatPercent } from '@dinamique/utils';
import { Badge, Button, Card, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { openPortal, startCheckout } from '@/features/billing/api';

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

interface Price {
  interval: BillingInterval;
  amount: number;
  configured: boolean;
}

/** Plano e assinatura (§56, §57), com pagamento pelo Stripe. */
export default function Plan() {
  const theme = useTheme();
  const router = useRouter();
  const { session, plan, isTrial, refresh } = useSession();

  const [prices, setPrices] = useState<Price[]>([]);
  const [selected, setSelected] = useState<BillingInterval>('year');
  const [subscription, setSubscription] = useState<Record<string, any> | null>(null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user) return;

    const [pricesResult, subscriptionResult, benefitResult] = await Promise.all([
      supabase.from('billing_prices').select('interval, amount, stripe_price_id').eq('is_active', true),
      supabase
        .from('subscriptions')
        .select('billing_status, billing_interval, current_period_end, cancel_at_period_end, source, expires_at')
        .eq('user_id', session.user.id)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('discount_benefits')
        .select('amount')
        .eq('user_id', session.user.id)
        .eq('status', 'granted')
        .maybeSingle(),
    ]);

    setPrices(
      ((pricesResult.data as Record<string, any>[] | null) ?? []).map((row) => ({
        interval: row.interval as BillingInterval,
        amount: Number(row.amount),
        // Sem preço criado no Stripe, o botão não pode prometer pagamento.
        configured: Boolean(row.stripe_price_id),
      })),
    );
    setSubscription((subscriptionResult.data as Record<string, any> | null) ?? null);
    setDiscount((benefitResult.data?.amount as number | undefined) ?? null);
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthly = prices.find((price) => price.interval === 'month');
  const annual = prices.find((price) => price.interval === 'year');
  const savings = monthly && annual ? annualSavings(monthly.amount, annual.amount) : null;
  const canPay = prices.some((price) => price.configured);

  async function subscribe() {
    setBusy(true);
    const result = await startCheckout(selected);
    setBusy(false);

    if (!result.ok) {
      Alert.alert('Assinatura', result.message);
      return;
    }
    // O webhook é quem confirma. Recarregamos para mostrar o estado real em
    // vez de anunciar sucesso que ainda não aconteceu.
    await load();
    await refresh();
  }

  async function manage() {
    setBusy(true);
    const result = await openPortal();
    setBusy(false);

    if (!result.ok) {
      Alert.alert('Assinatura', result.message);
      return;
    }
    await load();
    await refresh();
  }

  const proFeatures = FEATURES.filter(
    (feature) => !hasFeature('free', feature) && FEATURE_LABELS[feature],
  );

  const isPaid = subscription?.billing_status === 'active' || subscription?.billing_status === 'trialing';
  const isPastDue = subscription?.billing_status === 'past_due';
  const daysLeft =
    subscription?.expires_at != null
      ? Math.max(0, Math.ceil((Date.parse(subscription.expires_at) - Date.now()) / 86_400_000))
      : null;

  return (
    <Screen
      header={<ScreenHeader title="Plano e assinatura" onBack={() => router.back()} />}
      gap="lg"
    >
        <Card padding="xl" style={{ gap: theme.spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text variant="titleLg">{plan === 'pro' ? 'Dinamique Pro' : 'Dinamique Free'}</Text>
            <Badge
              label={plan === 'pro' ? (isTrial ? 'Teste' : 'Ativo') : 'Free'}
              tone={isPastDue ? 'warning' : plan === 'pro' ? 'brand' : 'neutral'}
            />
          </View>

          {isPastDue ? (
            <Text variant="body" color="warning">
              Não conseguimos cobrar sua última fatura. Seu acesso continua liberado enquanto
              tentamos de novo — atualize seu cartão para não perder o Pro.
            </Text>
          ) : isTrial && daysLeft !== null ? (
            <Text variant="body" color="secondary">
              {daysLeft === 0
                ? 'Seu período de teste termina hoje.'
                : daysLeft === 1
                  ? 'Falta 1 dia do seu período de teste.'
                  : `Faltam ${daysLeft} dias do seu período de teste.`}{' '}
              Depois disso você continua usando o Dinamique no plano Free — nada é bloqueado de
              uma hora para outra.
            </Text>
          ) : isPaid ? (
            <Text variant="body" color="secondary">
              Assinatura {subscription?.billing_interval === 'year' ? 'anual' : 'mensal'} ativa
              {subscription?.current_period_end
                ? ` até ${new Date(subscription.current_period_end).toLocaleDateString('pt-BR')}`
                : ''}
              .
              {subscription?.cancel_at_period_end
                ? ' Você já pediu o cancelamento; o acesso vale até essa data.'
                : ''}
            </Text>
          ) : plan === 'pro' ? (
            <Text variant="body" color="secondary">
              Seu acesso Pro foi concedido pela equipe Dinamique.
            </Text>
          ) : (
            <Text variant="body" color="secondary">
              Você tem jornadas, ganhos, gastos, abastecimento, meta do dia e suporte. O Pro
              adiciona profundidade.
            </Text>
          )}
        </Card>

        {discount && !isPaid ? (
          <Card padding="lg" style={{ backgroundColor: theme.colors.brandPrimarySubtle }}>
            <Text variant="bodyStrong" color="brand">
              Você tem {formatCents(discount)} de desconto
            </Text>
            <Text variant="caption" color="secondary">
              É aplicado automaticamente na sua primeira cobrança.
            </Text>
          </Card>
        ) : null}

        {isPaid || isPastDue ? (
          <Button
            label="Gerenciar assinatura"
            size="lg"
            fullWidth
            loading={busy}
            onPress={manage}
          />
        ) : (
          <>
            <View style={{ gap: theme.spacing.md }}>
              {annual ? (
                <PlanOption
                  label="Anual"
                  amount={annual.amount}
                  caption={`${formatCents(monthlyEquivalent(annual.amount))} por mês, cobrados de uma vez`}
                  highlight={
                    savings ? `Economize ${formatPercent(savings.ratio, 0)}` : undefined
                  }
                  selected={selected === 'year'}
                  onPress={() => setSelected('year')}
                />
              ) : null}
              {monthly ? (
                <PlanOption
                  label="Mensal"
                  amount={monthly.amount}
                  caption="Cancele quando quiser"
                  selected={selected === 'month'}
                  onPress={() => setSelected('month')}
                />
              ) : null}
            </View>

            {canPay ? (
              <Button
                label="Assinar o Pro"
                size="lg"
                fullWidth
                loading={busy}
                onPress={subscribe}
              />
            ) : (
              <Card padding="lg" style={{ gap: theme.spacing.sm }}>
                <Text variant="bodyStrong">Pagamento em configuração</Text>
                <Text variant="caption" color="secondary">
                  Os planos ainda não foram publicados no meio de pagamento. Quer o Pro agora?
                  Fale com a gente pelo suporte.
                </Text>
                <Button
                  label="Falar com o suporte"
                  variant="secondary"
                  size="sm"
                  onPress={() => router.push('/support/new')}
                />
              </Card>
            )}

            <Card padding="xl" style={{ gap: theme.spacing.sm }}>
              <Text variant="subtitle">O que vem no Pro</Text>
              {proFeatures.map((feature) => (
                <Text key={feature} variant="body" color="secondary">
                  • {FEATURE_LABELS[feature]}
                </Text>
              ))}
            </Card>
          </>
        )}

        <Text variant="caption" color="muted" align="center">
          Pagamento processado pelo Stripe. O Dinamique não guarda os dados do seu cartão.
        </Text>
    </Screen>
  );
}

function PlanOption({
  label,
  amount,
  caption,
  highlight,
  selected,
  onPress,
}: {
  label: string;
  amount: number;
  caption: string;
  highlight?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, ${formatCents(amount)}`}
      onPress={onPress}
      style={{
        borderRadius: theme.radius['2xl'],
        borderWidth: 2,
        borderColor: selected ? theme.colors.brandPrimary : theme.colors.borderPrimary,
        backgroundColor: theme.colors.surfacePrimary,
        padding: theme.spacing.xl,
        gap: theme.spacing.xs,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="subtitle">{label}</Text>
        {highlight ? <Badge label={highlight} tone="accent" /> : null}
      </View>
      <Text variant="moneyLarge" color={selected ? 'brand' : 'primary'}>
        {formatCents(amount)}
      </Text>
      <Text variant="caption" color="secondary">
        {caption}
      </Text>
    </Pressable>
  );
}
