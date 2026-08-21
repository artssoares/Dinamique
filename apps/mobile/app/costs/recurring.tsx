import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { RecurringCostPeriod } from '@dinamique/types';
import { apportionRecurringCost } from '@dinamique/business-logic';
import { formatCents, parseCents } from '@dinamique/utils';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Screen,
  ScreenHeader,
  Select,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

interface CostRow {
  id: string;
  label: string;
  amount: number;
  period: RecurringCostPeriod;
  expense_categories: { name: string } | null;
}

const PERIODS: { value: RecurringCostPeriod; label: string }[] = [
  { value: 'weekly', label: 'Por semana' },
  { value: 'monthly', label: 'Por mês' },
  { value: 'yearly', label: 'Por ano' },
];

/**
 * Custos recorrentes (§33). Cadastra uma vez e o sistema rateia depois – mas
 * a tela deixa explícito que isso é estimativa, não um gasto que aconteceu.
 */
export default function RecurringCosts() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();

  const [costs, setCosts] = useState<CostRow[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [adding, setAdding] = useState(false);

  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<RecurringCostPeriod>('monthly');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('recurring_costs')
      .select('id, label, amount, period, expense_categories(name)')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .order('amount', { ascending: false });
    setCosts((data as unknown as CostRow[] | null) ?? []);
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
    void supabase
      .from('expense_categories')
      .select('id, name')
      .eq('is_vehicle_cost', true)
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCategories((data as { id: string; name: string }[] | null) ?? []));
  }, [load]);

  async function save() {
    if (!session?.user || !categoryId) return;
    const value = parseCents(amount);
    if (value === null || value <= 0) return;

    setSaving(true);
    await supabase.from('recurring_costs').insert({
      user_id: session.user.id,
      category_id: categoryId,
      label: label.trim(),
      amount: value,
      period,
    });
    setSaving(false);
    setAdding(false);
    setLabel('');
    setAmount('');
    setCategoryId(null);
    await load();
  }

  async function remove(cost: CostRow) {
    Alert.alert('Remover custo?', `"${cost.label}" deixa de entrar nas estimativas.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('recurring_costs').update({ is_active: false }).eq('id', cost.id);
          await load();
        },
      },
    ]);
  }

  // Quanto tudo isso representa por dia – o número que o motorista consegue usar.
  const perDay = costs.reduce(
    (acc, cost) => acc + apportionRecurringCost({ amount: cost.amount, period: cost.period, days: 1 }),
    0,
  );

  return (
    <Screen
      header={
        <ScreenHeader
          title="Custos fixos"
          subtitle="O que sai todo mês, mesmo parado"
          onBack={() => router.back()}
        />
      }
      gap="lg"
    >
        <Text variant="body" color="secondary">
          Aluguel, financiamento, seguro, IPVA. Cadastre uma vez e o Dinamique divide o valor pelos
          dias para estimar quanto o veículo custa por dia.
        </Text>

        {costs.length > 0 ? (
          <Card padding="xl" style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" color="secondary">
              CUSTO FIXO ESTIMADO POR DIA
            </Text>
            <Text variant="moneyLarge">{formatCents(perDay)}</Text>
            <Text variant="caption" color="muted">
              É uma estimativa: o valor é rateado, não um gasto que aconteceu hoje.
            </Text>
          </Card>
        ) : null}

        {costs.length === 0 && !adding ? (
          <EmptyState
            title="Nenhum custo fixo cadastrado"
            description="Sem eles, o custo por quilômetro considera só o que você lança no dia a dia."
            actionLabel="Adicionar custo fixo"
            onAction={() => setAdding(true)}
          />
        ) : null}

        {costs.map((cost) => (
          <Card key={cost.id} padding="lg" style={{ gap: theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">{cost.label}</Text>
              <Text variant="bodyStrong">{formatCents(cost.amount)}</Text>
            </View>
            <Text variant="caption" color="secondary">
              {cost.expense_categories?.name ?? '–'} ·{' '}
              {PERIODS.find((p) => p.value === cost.period)?.label.toLowerCase()}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => remove(cost)}>
              <Text variant="caption" color="danger">
                Remover
              </Text>
            </Pressable>
          </Card>
        ))}

        {adding ? (
          <Card padding="xl" style={{ gap: theme.spacing.lg }}>
            <Field label="Nome" placeholder="Ex.: aluguel do carro" value={label} onChangeText={setLabel} />
            <Field
              label="Valor"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="R$ 0,00"
            />
            <Select
              label="Categoria"
              value={categoryId}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              onChange={setCategoryId}
            />
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="captionStrong" color="secondary">
                PERÍODO
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {PERIODS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    selected={period === option.value}
                    onPress={() => setPeriod(option.value)}
                  />
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm }}>
              <Button
                label="Salvar"
                loading={saving}
                disabled={label.trim() === '' || !categoryId || !parseCents(amount)}
                onPress={save}
              />
              <Button label="Cancelar" variant="ghost" onPress={() => setAdding(false)} />
            </View>
          </Card>
        ) : costs.length > 0 ? (
          <Button label="Adicionar custo fixo" variant="ghost" fullWidth onPress={() => setAdding(true)} />
        ) : null}
    </Screen>
  );
}
