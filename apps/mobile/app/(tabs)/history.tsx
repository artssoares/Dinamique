import { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCents, formatDistanceKm, formatDuration, periodRange, toDateOnly, weekdayLabel } from '@dinamique/utils';
import { Card, Chip, EmptyState, Skeleton, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

type Period = 'weekly' | 'monthly' | 'yearly';

interface DayRow {
  date: string;
  gross_revenue: number;
  total_expenses: number;
  net_profit: number;
  worked_seconds: number;
  distance: number;
}

/** Day-by-day history over a chosen period (§53). */
export default function History() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const [period, setPeriod] = useState<Period>('weekly');
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    const range = periodRange(period, toDateOnly(new Date()));

    const { data } = await supabase
      .from('daily_totals')
      .select('date, gross_revenue, total_expenses, net_profit, worked_seconds, distance')
      .eq('user_id', session.user.id)
      .gte('date', range.start)
      .lte('date', range.end)
      .order('date', { ascending: false });

    setRows((data as DayRow[] | null) ?? []);
    setLoading(false);
  }, [period, session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = rows.reduce(
    (acc, row) => ({
      gross: acc.gross + row.gross_revenue,
      expenses: acc.expenses + row.total_expenses,
      profit: acc.profit + row.net_profit,
      seconds: acc.seconds + row.worked_seconds,
      distance: acc.distance + row.distance,
    }),
    { gross: 0, expenses: 0, profit: 0, seconds: 0, distance: 0 },
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
      contentContainerStyle={{
        padding: theme.spacing.xl,
        paddingTop: insets.top + theme.spacing.lg,
        gap: theme.spacing.md,
        flexGrow: 1,
      }}
      data={rows}
      keyExtractor={(item) => item.date}
      onRefresh={load}
      refreshing={false}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
          <Text variant="titleLg">Histórico</Text>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Chip label="Semana" selected={period === 'weekly'} onPress={() => setPeriod('weekly')} />
            <Chip label="Mês" selected={period === 'monthly'} onPress={() => setPeriod('monthly')} />
            <Chip label="Ano" selected={period === 'yearly'} onPress={() => setPeriod('yearly')} />
          </View>

          {rows.length > 0 ? (
            <Card padding="lg" style={{ gap: theme.spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Summary label="Faturamento" value={formatCents(totals.gross)} />
                <Summary label="Despesas" value={formatCents(totals.expenses)} />
                <Summary label="Lucro" value={formatCents(totals.profit)} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Summary
                  label="Tempo"
                  value={totals.seconds > 0 ? formatDuration(totals.seconds) : '—'}
                />
                <Summary
                  label="Distância"
                  value={totals.distance > 0 ? formatDistanceKm(totals.distance) : '—'}
                />
                <Summary label="Dias" value={String(rows.length)} />
              </View>
            </Card>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <View style={{ gap: theme.spacing.md }}>
            <Skeleton height={80} radius={theme.radius['2xl']} />
            <Skeleton height={80} radius={theme.radius['2xl']} />
          </View>
        ) : (
          <EmptyState
            title="Nada registrado neste período"
            description="Quando você registrar ganhos ou jornadas, eles aparecem aqui."
          />
        )
      }
      renderItem={({ item }) => (
        <Card padding="lg" style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <View>
              <Text variant="bodyStrong">
                {new Date(`${item.date}T00:00:00`).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'short',
                })}
              </Text>
              <Text variant="caption" color="secondary">
                {weekdayLabel(item.date)}
              </Text>
            </View>
            <Text variant="moneyMedium" color={item.net_profit >= 0 ? 'success' : 'danger'}>
              {formatCents(item.net_profit)}
            </Text>
          </View>
          <Text variant="caption" color="secondary">
            {formatCents(item.gross_revenue)} faturado · {formatCents(item.total_expenses)} em custos
            {item.worked_seconds > 0 ? ` · ${formatDuration(item.worked_seconds)}` : ''}
          </Text>
        </Card>
      )}
    />
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}
