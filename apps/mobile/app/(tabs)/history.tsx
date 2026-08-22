import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatCents, formatDistanceKm, formatDuration, periodRange, toDateOnly, weekdayLabel } from '@dinamique/utils';
import {
  Card,
  EmptyState,
  Icon,
  Screen,
  SegmentedControl,
  Skeleton,
  StatTile,
  Text,
  useTheme,
} from '@dinamique/ui';
import { AppHeader } from '@/features/shell/AppHeader';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useRouteDays } from '@/features/route/useJourneyRoute';

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
  const router = useRouter();
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

  // Which days have a drawing, in one query for the whole period. The glyph
  // only appears where tapping actually leads somewhere — an icon that opens
  // an empty screen is worse than no icon.
  const range = periodRange(period, toDateOnly(new Date()));
  const routeDays = useRouteDays(range.start, range.end);

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
    <Screen
      header={<AppHeader title="Histórico" subtitle="Dia a dia do que você ganhou e gastou" />}
      scroll={false}
      padding="none"
      tabBarSpacing
    >
    <FlatList
      contentContainerStyle={{ gap: theme.spacing.md, flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      data={rows}
      keyExtractor={(item) => item.date}
      onRefresh={load}
      refreshing={false}
      ListHeaderComponent={
        <View style={{ gap: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
          <SegmentedControl
            label="Período"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'weekly', label: 'Semana' },
              { value: 'monthly', label: 'Mês' },
              { value: 'yearly', label: 'Ano' },
            ]}
          />

          {rows.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
              <StatTile label="Faturamento" icon="wallet" value={formatCents(totals.gross)} />
              <StatTile
                label="Lucro"
                icon="trendUp"
                tone={totals.profit < 0 ? 'danger' : 'success'}
                value={formatCents(totals.profit)}
              />
              <StatTile label="Despesas" icon="receipt" tone="danger" value={formatCents(totals.expenses)} />
              <StatTile
                label="Tempo"
                icon="clock"
                value={totals.seconds > 0 ? formatDuration(totals.seconds) : null}
                emptyHint="nenhuma jornada"
              />
              <StatTile
                label="Distância"
                icon="route"
                value={totals.distance > 0 ? formatDistanceKm(totals.distance) : null}
                emptyHint="sem km"
              />
              <StatTile label="Dias com registro" icon="history" value={String(rows.length)} />
            </View>
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
            iconName="history"
            title="Nada registrado neste período"
            description="Quando você registrar ganhos ou jornadas, eles aparecem aqui."
          />
        )
      }
      renderItem={({ item }) => {
        const hasRoute = routeDays.has(item.date);

        const card = (
          <Card padding="lg" style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
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
                {/* Um glifo, e só nos dias que têm trajeto. Sem selo, sem
                    banner, sem convencer ninguém a ligar o GPS. */}
                {hasRoute ? (
                  <Icon name="route" size={16} color={theme.colors.brandPrimary} />
                ) : null}
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
        );

        // Só os dias com trajeto viram botão. Um dia sem desenho continua
        // exatamente a linha que sempre foi — nada aqui muda para quem
        // nunca ligou a contagem por GPS.
        if (!hasRoute) return card;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver o trajeto de ${weekdayLabel(item.date)}`}
            onPress={() => router.push({ pathname: '/journey/replay', params: { date: item.date } })}
          >
            {card}
          </Pressable>
        );
      }}
    />
    </Screen>
  );
}
