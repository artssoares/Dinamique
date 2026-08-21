import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { summarisePeriod } from '@dinamique/business-logic';
import { formatCents, formatDuration, parseCents, toDateOnly } from '@dinamique/utils';
import {
  Button,
  Card,
  Chip,
  Field,
  Money,
  Notice,
  Screen,
  ScreenHeader,
  StepProgress,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { toFriendlyError } from '@/lib/errors';
import { useSession } from '@/hooks/useSession';
import { useActiveJourney } from '@/features/journey/useJourney';
import { useCostCategories } from '@/features/costs/categories';
import { ProductSalePicker } from '@/features/products/ProductSalePicker';
import { costRows, revenueRows as saleRevenueRows, totalsFor } from '@/features/products/sales';
import { useProducts } from '@/features/products/useProducts';

interface Platform {
  id: string;
  name: string;
}

interface QuickCategory {
  id: string;
  name: string;
}

/** Categorias de gasto que aparecem como atalho no fim da jornada (§52). */
const QUICK_SLUGS = ['combustivel', 'alimentacao', 'pedagio', 'estacionamento'];

/**
 * Encerramento de jornada em três passos: quanto entrou por aplicativo, quantos
 * km, faltou algum gasto. Depois o resumo. A meta é fechar em ~30 segundos.
 */
export default function CloseJourney() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile } = useSession();
  const { journey, finish, refresh, error: journeyError, dismissError } = useActiveJourney();
  const { products, loading: productsLoading } = useProducts();
  const productCategory = useCostCategories(['produtos']);

  const [step, setStep] = useState(0);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [quickCategories, setQuickCategories] = useState<QuickCategory[]>([]);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [trips, setTrips] = useState<Record<string, string>>({});
  const [distance, setDistance] = useState('');
  const [odometerEnd, setOdometerEnd] = useState('');
  const [expenses, setExpenses] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    void supabase
      .from('user_platforms')
      .select('platforms(id, name, sort_order)')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        const rows = ((data as { platforms: Platform & { sort_order: number } }[] | null) ?? [])
          .map((row) => row.platforms)
          .filter(Boolean)
          .sort((a, b) => a.sort_order - b.sort_order);
        setPlatforms(rows);
      });

    void supabase
      .from('expense_categories')
      .select('id, name, slug')
      .in('slug', QUICK_SLUGS)
      .then(({ data }) => {
        const rows = (data as (QuickCategory & { slug: string })[] | null) ?? [];
        // Mantém a ordem dos atalhos igual à do spec, não a do banco.
        setQuickCategories(
          QUICK_SLUGS.map((slug) => rows.find((r) => r.slug === slug)).filter(
            (r): r is QuickCategory & { slug: string } => Boolean(r),
          ),
        );
      });
  }, [session?.user?.id]);

  const saleLines = useMemo(
    () => products.map((product) => ({ product, quantity: units[product.id] ?? 0 })),
    [products, units],
  );
  const saleTotals = useMemo(() => totalsFor(saleLines), [saleLines]);
  const sells = Boolean(profile?.sellsProducts) || products.length > 0;

  const totals = useMemo(() => {
    const fares = Object.values(amounts).reduce((acc, value) => acc + (parseCents(value) ?? 0), 0);
    const spent = Object.values(expenses).reduce((acc, value) => acc + (parseCents(value) ?? 0), 0);
    // The goods that left the boot are a cost of the day exactly like fuel is.
    const gross = fares + saleTotals.gross;
    const costs = spent + saleTotals.cost;
    return { gross, costs, profit: gross - costs };
  }, [amounts, expenses, saleTotals]);

  const workedSeconds = journey
    ? Math.max(0, Math.round((Date.now() - Date.parse(journey.startedAt)) / 1000) - journey.pausedSeconds)
    : 0;

  async function save() {
    if (!session?.user || !journey) return;
    setSaving(true);
    setFailure(null);
    dismissError();
    const date = toDateOnly(new Date());

    // Tudo é gravado antes de encerrar a jornada, para que nada fique órfão se
    // a conexão cair no meio.
    const revenueRows = platforms
      .map((platform) => ({
        user_id: session.user!.id,
        journey_id: journey.id,
        platform_id: platform.id,
        date,
        amount: parseCents(amounts[platform.id] ?? '') ?? 0,
        trip_count: trips[platform.id]?.trim() ? Number(trips[platform.id]) : null,
      }))
      .filter((row) => row.amount > 0);

    const productRows = saleRevenueRows({
      userId: session.user.id,
      journeyId: journey.id,
      date,
      lines: saleLines,
    });

    if (revenueRows.length + productRows.length > 0) {
      const { error } = await supabase.from('revenues').insert([...revenueRows, ...productRows]);
      // Encerrar a jornada sem ter gravado o faturamento apagaria o dia
      // inteiro em silêncio, então nada segue adiante daqui.
      if (error) {
        setFailure(toFriendlyError(error).message);
        setSaving(false);
        return;
      }
    }

    const expenseRows = [
      ...quickCategories
        .map((category) => ({
          user_id: session.user!.id,
          journey_id: journey.id,
          category_id: category.id,
          date,
          amount: parseCents(expenses[category.id] ?? '') ?? 0,
        }))
        .filter((row) => row.amount > 0),
      ...costRows({
        userId: session.user.id,
        journeyId: journey.id,
        date,
        categoryId: productCategory.produtos ?? null,
        lines: saleLines,
      }),
    ];

    if (expenseRows.length > 0) {
      const { error } = await supabase.from('expenses').insert(expenseRows);
      if (error) {
        setFailure(toFriendlyError(error).message);
        setSaving(false);
        return;
      }
    }

    const parsedDistance = distance.trim() === '' ? null : Math.round(Number(distance) * 1000);
    const parsedOdometer = odometerEnd.trim() === '' ? null : Math.round(Number(odometerEnd) * 1000);

    const closed = await finish({
      odometerEnd: parsedOdometer,
      distanceOverride: Number.isFinite(parsedDistance) ? parsedDistance : null,
    });

    setSaving(false);

    if (!closed) return;

    void track('journey_completed', {
      platforms: revenueRows.length,
      has_distance: parsedDistance !== null || parsedOdometer !== null,
    });

    setDone(true);
    await refresh();
  }

  if (!journey && !done) {
    return (
      <Screen
        header={<ScreenHeader title="Encerrar jornada" onBack={() => router.back()} />}
        center
      >
        <Card padding="xl" style={{ gap: theme.spacing.sm }}>
          <Text variant="subtitle">Nenhuma jornada em andamento</Text>
          <Text variant="body" color="secondary">
            Inicie uma jornada para poder encerrá-la aqui.
          </Text>
        </Card>
      </Screen>
    );
  }

  // ------------------------------------------------------------- resumo ----
  if (done) {
    const summary = summarisePeriod({
      journeys: [
        {
          id: journey?.id ?? 'x',
          startedAt: journey?.startedAt ?? new Date().toISOString(),
          endedAt: new Date().toISOString(),
          pausedSeconds: journey?.pausedSeconds ?? 0,
          odometerStart: null,
          odometerEnd: null,
          distanceOverride: distance.trim() === '' ? null : Math.round(Number(distance) * 1000),
        },
      ],
      revenues: [{ date: toDateOnly(new Date()), amount: totals.gross, tips: 0, tripCount: null, platformId: null }],
      // Two entries, not one: a box of perfume is a cost of the day but not a
      // cost of the vehicle, and lumping it in would inflate the cost per km.
      expenses: [
        { date: toDateOnly(new Date()), amount: totals.costs - saleTotals.cost, isVehicleCost: true },
        { date: toDateOnly(new Date()), amount: saleTotals.cost, isVehicleCost: false },
      ],
    });

    return (
      <Screen
        header={
          <ScreenHeader
            title="Jornada encerrada"
            subtitle="Veja como foi o seu dia"
            onBack={() => router.replace('/(tabs)')}
          />
        }
      >
          <Card padding="xl" style={{ gap: theme.spacing.lg }}>
            <Text variant="caption" color="secondary">
              LUCRO ESTIMADO DA JORNADA
            </Text>
            <Money value={totals.profit} variant="moneyHero" colorBySign animate />

            <View style={{ gap: theme.spacing.sm }}>
              <Row label="Faturamento" value={formatCents(totals.gross)} />
              <Row label="Custos" value={formatCents(totals.costs)} />
              <Row label="Tempo trabalhado" value={formatDuration(summary.workedSeconds)} />
              {summary.profitPerHour !== null ? (
                <Row label="Lucro por hora" value={formatCents(summary.profitPerHour)} />
              ) : null}
              {summary.revenuePerKm !== null ? (
                <Row label="Faturamento por km" value={formatCents(summary.revenuePerKm)} />
              ) : (
                <Row label="Faturamento por km" value="sem km informado" />
              )}
            </View>
          </Card>

        <Button
          label="Voltar para o início"
          size="lg"
          fullWidth
          iconName="home"
          onPress={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  // -------------------------------------------------------------- passos ---
  const steps = [
    {
      title: 'Quanto entrou hoje?',
      subtitle: 'Informe o valor de cada aplicativo que você usou.',
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          {platforms.length === 0 ? (
            <Text variant="caption" color="muted">
              Você ainda não escolheu seus aplicativos. Dá para ajustar isso no seu perfil.
            </Text>
          ) : (
            platforms.map((platform) => (
              <View key={platform.id} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 2 }}>
                  <Field
                    label={platform.name}
                    value={amounts[platform.id] ?? ''}
                    onChangeText={(value) => setAmounts({ ...amounts, [platform.id]: value })}
                    keyboardType="decimal-pad"
                    placeholder="R$ 0,00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Corridas"
                    optional
                    value={trips[platform.id] ?? ''}
                    onChangeText={(value) => setTrips({ ...trips, [platform.id]: value })}
                    keyboardType="number-pad"
                    placeholder="–"
                  />
                </View>
              </View>
            ))
          )}
        </View>
      ),
    },
    ...(sells
      ? [
          {
            title: 'Vendeu alguma coisa?',
            subtitle: 'Conte quantas unidades saíram. O preço o Dinamique já sabe.',
            content: (
              <ProductSalePicker
                products={products}
                quantities={units}
                loading={productsLoading}
                onChange={(id, quantity) =>
                  setUnits((current) => ({ ...current, [id]: quantity }))
                }
              />
            ),
          },
        ]
      : []),
    {
      title: 'Quantos km você rodou?',
      subtitle: 'É opcional. Sem km, deixamos de mostrar apenas as contas por quilômetro.',
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          <Field
            label="Quilômetros rodados"
            optional
            value={distance}
            onChangeText={setDistance}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <Text variant="caption" color="muted">
            Ou, se preferir, informe o odômetro final:
          </Text>
          <Field
            label="Odômetro final (km)"
            optional
            value={odometerEnd}
            onChangeText={setOdometerEnd}
            keyboardType="number-pad"
          />
        </View>
      ),
    },
    {
      title: 'Faltou algum gasto?',
      subtitle: 'Toque no que você gastou hoje e informe o valor.',
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {quickCategories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                selected={expenses[category.id] !== undefined}
                onPress={() => {
                  const next = { ...expenses };
                  if (next[category.id] !== undefined) delete next[category.id];
                  else next[category.id] = '';
                  setExpenses(next);
                }}
              />
            ))}
          </View>

          {quickCategories
            .filter((category) => expenses[category.id] !== undefined)
            .map((category) => (
              <Field
                key={category.id}
                label={category.name}
                value={expenses[category.id] ?? ''}
                onChangeText={(value) => setExpenses({ ...expenses, [category.id]: value })}
                keyboardType="decimal-pad"
                placeholder="R$ 0,00"
              />
            ))}
        </View>
      ),
    },
  ];

  const current = steps[step]!;
  const isLast = step === steps.length - 1;
  const problem = failure ?? journeyError;

  return (
    <Screen
      header={
        <ScreenHeader
          title="Encerrar jornada"
          onBack={step > 0 ? () => setStep(step - 1) : () => router.back()}
        />
      }
      grow
      footer={
        <Button
          label={isLast ? 'Encerrar jornada' : 'Continuar'}
          size="lg"
          fullWidth
          loading={saving}
          iconName={isLast ? 'check' : 'chevronRight'}
          iconPosition="trailing"
          onPress={() => (isLast ? save() : setStep(step + 1))}
        />
      }
    >
        <StepProgress current={step} total={steps.length} />

        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="titleLg">{current.title}</Text>
          <Text variant="body" color="secondary">
            {current.subtitle}
          </Text>
        </View>

        <View style={{ flex: 1 }}>{current.content}</View>

        {problem !== null ? (
          <Notice
            message={problem}
            onDismiss={() => {
              setFailure(null);
              dismissError();
            }}
          />
        ) : null}

        {totals.gross > 0 ? (
          <Card padding="lg">
            <Text variant="caption" color="secondary">
              Parcial: {formatCents(totals.gross)} faturado
              {saleTotals.units > 0
                ? `, sendo ${formatCents(saleTotals.gross)} em ${saleTotals.units === 1 ? '1 venda' : `${saleTotals.units} vendas`}`
                : ''}
              {totals.costs > 0 ? ` · ${formatCents(totals.costs)} em custos` : ''}
              {` · ${formatDuration(workedSeconds)} trabalhados`}
            </Text>
          </Card>
        ) : null}

    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="captionStrong">{value}</Text>
    </View>
  );
}
