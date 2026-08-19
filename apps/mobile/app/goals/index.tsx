import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { GoalBasis, GoalPeriod } from '@dinamique/types';
import { computeGoalProgress, deriveGoalSuggestions } from '@dinamique/business-logic';
import { formatCents, parseCents, periodRange, toDateOnly } from '@dinamique/utils';
import {
  AmountInput,
  Button,
  Card,
  GoalProgress,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';

const PERIODS: { value: GoalPeriod; label: string }[] = [
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
];

interface GoalRow {
  id: string;
  period: GoalPeriod;
  basis: GoalBasis;
  target: number;
}

/**
 * Metas (§37–39). Diária e mensal ficam no topo porque são as que o motorista
 * consulta todo dia; a anual existe, mas com menos destaque.
 */
export default function Goals() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();

  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [achieved, setAchieved] = useState<Record<GoalPeriod, { gross: number; net: number }>>({
    daily: { gross: 0, net: 0 },
    weekly: { gross: 0, net: 0 },
    monthly: { gross: 0, net: 0 },
    yearly: { gross: 0, net: 0 },
  });

  const [editing, setEditing] = useState<GoalPeriod | null>(null);
  const [draftValue, setDraftValue] = useState('');
  const [draftBasis, setDraftBasis] = useState<GoalBasis>('gross');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user) return;
    const today = toDateOnly(new Date());

    const [goalsResult, totalsResult] = await Promise.all([
      supabase
        .from('goals')
        .select('id, period, basis, target')
        .eq('user_id', session.user.id)
        .eq('is_active', true),
      supabase
        .from('daily_totals')
        .select('date, gross_revenue, net_profit')
        .eq('user_id', session.user.id)
        .gte('date', periodRange('yearly', today).start)
        .lte('date', periodRange('yearly', today).end),
    ]);

    setGoals((goalsResult.data as GoalRow[] | null) ?? []);

    const rows = (totalsResult.data as { date: string; gross_revenue: number; net_profit: number }[] | null) ?? [];
    const next = {} as Record<GoalPeriod, { gross: number; net: number }>;
    for (const period of ['daily', 'weekly', 'monthly', 'yearly'] as GoalPeriod[]) {
      const range = periodRange(period, today);
      const inRange = rows.filter((row) => row.date >= range.start && row.date <= range.end);
      next[period] = {
        gross: inRange.reduce((acc, row) => acc + row.gross_revenue, 0),
        net: inRange.reduce((acc, row) => acc + row.net_profit, 0),
      };
    }
    setAchieved(next);
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  function startEditing(period: GoalPeriod) {
    const existing = goals.find((goal) => goal.period === period);
    setEditing(period);
    setDraftValue(existing ? formatCents(existing.target, { withSymbol: false }) : '');
    setDraftBasis(existing?.basis ?? 'gross');
  }

  async function saveGoal(period: GoalPeriod) {
    if (!session?.user) return;
    const target = parseCents(draftValue);
    if (target === null || target <= 0) {
      Alert.alert('Valor inválido', 'Informe um valor maior que zero.');
      return;
    }

    setSaving(true);
    const existing = goals.find((goal) => goal.period === period);

    if (existing) {
      await supabase.from('goals').update({ target, basis: draftBasis }).eq('id', existing.id);
    } else {
      await supabase.from('goals').insert({
        user_id: session.user.id,
        period,
        basis: draftBasis,
        target,
      });
      void track('goal_created', { period });
    }

    setSaving(false);
    setEditing(null);
    await load();
  }

  async function removeGoal(period: GoalPeriod) {
    const existing = goals.find((goal) => goal.period === period);
    if (!existing) return;

    Alert.alert('Remover meta?', 'Você pode criar outra quando quiser.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          // Desativamos em vez de apagar, para o histórico continuar explicável.
          await supabase.from('goals').update({ is_active: false }).eq('id', existing.id);
          setEditing(null);
          await load();
        },
      },
    ]);
  }

  const monthlyGoal = goals.find((goal) => goal.period === 'monthly');
  const suggestions = monthlyGoal ? deriveGoalSuggestions(monthlyGoal.target) : null;

  return (
    <Screen
      header={
        <ScreenHeader
          title="Metas"
          subtitle="Quanto você quer atingir em cada período"
          onBack={() => router.back()}
        />
      }
      gap="lg"
    >
        {PERIODS.map(({ value: period, label }) => {
          const goal = goals.find((g) => g.period === period);
          const isEditing = editing === period;
          const value = goal
            ? achieved[period][goal.basis === 'gross' ? 'gross' : 'net']
            : 0;

          return (
            <Card key={period} padding="xl" style={{ gap: theme.spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="subtitle">Meta {label.toLowerCase()}</Text>
                {!isEditing ? (
                  <Button
                    label={goal ? 'Editar' : 'Criar meta'}
                    variant="secondary"
                    size="sm"
                    iconName={goal ? 'settings' : 'plus'}
                    onPress={() => startEditing(period)}
                  />
                ) : null}
              </View>

              {isEditing ? (
                <View style={{ gap: theme.spacing.lg }}>
                  <AmountInput
                    label="Quanto você quer atingir"
                    value={draftValue}
                    onChangeText={setDraftValue}
                  />

                  <View style={{ gap: theme.spacing.sm }}>
                    <Text variant="captionStrong" color="secondary">
                      CONTAR COMO
                    </Text>
                    <SegmentedControl
                      label="Contar como"
                      value={draftBasis}
                      onChange={setDraftBasis}
                      options={[
                        { value: 'gross', label: 'Faturamento' },
                        { value: 'net', label: 'Lucro líquido' },
                      ]}
                    />
                    <Text variant="caption" color="muted">
                      {draftBasis === 'gross'
                        ? 'Conta tudo que você recebeu dos aplicativos.'
                        : 'Conta o que sobrou depois de descontar seus gastos.'}
                    </Text>
                  </View>

                  {period === 'monthly' && parseCents(draftValue) ? (
                    <Text variant="caption" color="secondary">
                      Isso dá cerca de{' '}
                      {formatCents(deriveGoalSuggestions(parseCents(draftValue)!).daily)} por dia.
                    </Text>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                    <Button
                      label="Salvar"
                      iconName="check"
                      loading={saving}
                      onPress={() => saveGoal(period)}
                    />
                    <Button label="Cancelar" variant="ghost" onPress={() => setEditing(null)} />
                    {goal ? (
                      <Button
                        label="Remover"
                        variant="ghost"
                        onPress={() => removeGoal(period)}
                        style={{ marginLeft: 'auto' }}
                      />
                    ) : null}
                  </View>
                </View>
              ) : goal ? (
                <GoalProgress
                  label={goal.basis === 'gross' ? 'Faturamento' : 'Lucro líquido'}
                  progress={computeGoalProgress({
                    target: goal.target,
                    achieved: value,
                    period,
                    today: toDateOnly(new Date()),
                  })}
                />
              ) : (
                <Text variant="caption" color="muted">
                  Sem meta {label.toLowerCase()} definida.
                  {period !== 'monthly' && suggestions
                    ? ` Pela sua meta mensal, ${formatCents(suggestions[period])} faria sentido.`
                    : ''}
                </Text>
              )}
            </Card>
          );
        })}
    </Screen>
  );
}
