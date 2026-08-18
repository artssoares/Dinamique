import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { summarisePeriod } from '@dinamique/business-logic';
import { formatCents, formatDuration, parseCents, toDateOnly } from '@dinamique/utils';
import { Button, Card, Chip, Field, Money, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';
import { useActiveJourney } from '@/features/journey/useJourney';

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
  const { session } = useSession();
  const { journey, finish, refresh } = useActiveJourney();

  const [step, setStep] = useState(0);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [quickCategories, setQuickCategories] = useState<QuickCategory[]>([]);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [trips, setTrips] = useState<Record<string, string>>({});
  const [distance, setDistance] = useState('');
  const [odometerEnd, setOdometerEnd] = useState('');
  const [expenses, setExpenses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

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

  const totals = useMemo(() => {
    const gross = Object.values(amounts).reduce((acc, value) => acc + (parseCents(value) ?? 0), 0);
    const costs = Object.values(expenses).reduce((acc, value) => acc + (parseCents(value) ?? 0), 0);
    return { gross, costs, profit: gross - costs };
  }, [amounts, expenses]);

  const workedSeconds = journey
    ? Math.max(0, Math.round((Date.now() - Date.parse(journey.startedAt)) / 1000) - journey.pausedSeconds)
    : 0;

  async function save() {
    if (!session?.user || !journey) return;
    setSaving(true);
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

    if (revenueRows.length > 0) {
      await supabase.from('revenues').insert(revenueRows);
    }

    const expenseRows = quickCategories
      .map((category) => ({
        user_id: session.user!.id,
        journey_id: journey.id,
        category_id: category.id,
        date,
        amount: parseCents(expenses[category.id] ?? '') ?? 0,
      }))
      .filter((row) => row.amount > 0);

    if (expenseRows.length > 0) {
      await supabase.from('expenses').insert(expenseRows);
    }

    const parsedDistance = distance.trim() === '' ? null : Math.round(Number(distance) * 1000);
    const parsedOdometer = odometerEnd.trim() === '' ? null : Math.round(Number(odometerEnd) * 1000);

    await finish({
      odometerEnd: parsedOdometer,
      distanceOverride: Number.isFinite(parsedDistance) ? parsedDistance : null,
    });

    void track('journey_completed', {
      platforms: revenueRows.length,
      has_distance: parsedDistance !== null || parsedOdometer !== null,
    });

    setSaving(false);
    setDone(true);
    await refresh();
  }

  if (!journey && !done) {
    return (
      <>
        <Stack.Screen options={{ title: 'Encerrar jornada' }} />
        <View style={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'center' }}>
          <Card padding="xl">
            <Text variant="subtitle">Nenhuma jornada em andamento</Text>
            <Text variant="caption" color="secondary">
              Inicie uma jornada para poder encerrá-la aqui.
            </Text>
          </Card>
        </View>
      </>
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
      expenses: [{ date: toDateOnly(new Date()), amount: totals.costs, isVehicleCost: true }],
    });

    return (
      <>
        <Stack.Screen options={{ title: 'Jornada encerrada' }} />
        <ScrollView
          style={{ backgroundColor: theme.colors.backgroundPrimary }}
          contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}
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
                <Row label="Faturamento por km" value="— sem km informado" />
              )}
            </View>
          </Card>

          <Button label="Voltar para o início" size="lg" fullWidth onPress={() => router.replace('/(tabs)')} />
        </ScrollView>
      </>
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
                    placeholder="—"
                  />
                </View>
              </View>
            ))
          )}
        </View>
      ),
    },
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

  return (
    <>
      <Stack.Screen options={{ title: 'Encerrar jornada' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
        contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          {steps.map((_, index) => (
            <View
              key={index}
              style={{
                flex: 1,
                height: 4,
                borderRadius: theme.radius.pill,
                backgroundColor:
                  index <= step ? theme.colors.brandPrimary : theme.colors.backgroundSecondary,
              }}
            />
          ))}
        </View>

        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="titleLg">{current.title}</Text>
          <Text variant="body" color="secondary">
            {current.subtitle}
          </Text>
        </View>

        <View style={{ flex: 1 }}>{current.content}</View>

        {totals.gross > 0 ? (
          <Card padding="lg">
            <Text variant="caption" color="secondary">
              Parcial: {formatCents(totals.gross)} faturado
              {totals.costs > 0 ? ` · ${formatCents(totals.costs)} em custos` : ''}
              {` · ${formatDuration(workedSeconds)} trabalhados`}
            </Text>
          </Card>
        ) : null}

        <View style={{ gap: theme.spacing.sm }}>
          <Button
            label={isLast ? 'Encerrar jornada' : 'Continuar'}
            size="lg"
            fullWidth
            loading={saving}
            onPress={() => (isLast ? save() : setStep(step + 1))}
          />
          {step > 0 ? (
            <Button label="Voltar" variant="ghost" fullWidth onPress={() => setStep(step - 1)} />
          ) : null}
        </View>
      </ScrollView>
    </>
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
