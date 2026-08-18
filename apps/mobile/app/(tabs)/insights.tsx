import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  generateInsights,
  summarisePeriod,
  type Insight,
  type PeriodSummary,
} from '@dinamique/business-logic';
import { addDays, periodRange, toDateOnly, weekdayLabel } from '@dinamique/utils';
import { EmptyState, InsightCard, Skeleton, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

interface DayRow {
  date: string;
  gross_revenue: number;
  total_expenses: number;
  vehicle_expenses: number;
  net_profit: number;
  worked_seconds: number;
  distance: number;
  trip_count: number;
}

/** Minimum days of history before an insight means anything. */
const MIN_DAYS_FOR_INSIGHTS = 5;

/**
 * Insights (§42). Interpretation, not dashboards — every sentence comes from a
 * deterministic rule in @dinamique/business-logic, so it can be explained.
 */
export default function Insights() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [dayCount, setDayCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);

    const today = toDateOnly(new Date());
    const current = periodRange('weekly', today);
    const previous = { start: addDays(current.start, -7), end: addDays(current.end, -7) };

    const [rowsResult, fuelResult] = await Promise.all([
      supabase
        .from('daily_totals')
        .select('date, gross_revenue, total_expenses, vehicle_expenses, net_profit, worked_seconds, distance, trip_count')
        .eq('user_id', session.user.id)
        .gte('date', previous.start)
        .lte('date', current.end),
      supabase
        .from('fuel_logs')
        .select('total_amount')
        .eq('user_id', session.user.id)
        .gte('date', current.start)
        .lte('date', current.end),
    ]);

    const rows = (rowsResult.data as DayRow[] | null) ?? [];
    setDayCount(rows.filter((r) => r.gross_revenue > 0 || r.worked_seconds > 0).length);

    const summarise = (subset: DayRow[]): PeriodSummary =>
      summarisePeriod({
        // Each day is folded into one synthetic journey so the shared
        // calculator stays the single source of truth for these metrics.
        journeys: subset.map((row) => ({
          id: row.date,
          startedAt: `${row.date}T00:00:00.000Z`,
          endedAt: new Date(Date.parse(`${row.date}T00:00:00.000Z`) + row.worked_seconds * 1000).toISOString(),
          pausedSeconds: 0,
          odometerStart: null,
          odometerEnd: null,
          distanceOverride: row.distance > 0 ? row.distance : null,
        })),
        revenues: subset.map((row) => ({
          date: row.date,
          amount: row.gross_revenue,
          tips: 0,
          tripCount: row.trip_count || null,
          platformId: null,
        })),
        expenses: [
          ...subset.map((row) => ({
            date: row.date,
            amount: row.vehicle_expenses,
            isVehicleCost: true,
          })),
          ...subset.map((row) => ({
            date: row.date,
            amount: row.total_expenses - row.vehicle_expenses,
            isVehicleCost: false,
          })),
        ],
      });

    const currentRows = rows.filter((r) => r.date >= current.start);
    const previousRows = rows.filter((r) => r.date < current.start);

    const fuelSpend = ((fuelResult.data as { total_amount: number }[] | null) ?? []).reduce(
      (acc, row) => acc + row.total_amount,
      0,
    );

    setInsights(
      generateInsights({
        current: summarise(currentRows),
        previous: summarise(previousRows),
        fuelSpend,
        bestWeekday: bestWeekday(rows),
        worstWeekday: worstWeekday(rows),
        goalStreakDays: 0,
      }).sort((a, b) => b.magnitude - a.magnitude),
    );

    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
      contentContainerStyle={{
        padding: theme.spacing.xl,
        paddingTop: insets.top + theme.spacing.lg,
        gap: theme.spacing.lg,
        flexGrow: 1,
      }}
    >
      <Text variant="titleLg">Insights</Text>

      {loading ? (
        <>
          <Skeleton height={72} radius={theme.radius['2xl']} />
          <Skeleton height={72} radius={theme.radius['2xl']} />
        </>
      ) : dayCount < MIN_DAYS_FOR_INSIGHTS ? (
        <EmptyState
          title="Ainda estamos conhecendo sua rotina"
          description={`Depois de ${MIN_DAYS_FOR_INSIGHTS} dias com registros, o Dinamique começa a comparar seus resultados e apontar o que mudou.`}
        />
      ) : insights.length === 0 ? (
        <EmptyState
          title="Nada fora do comum esta semana"
          description="Seus números estão em linha com sua média. Isso também é uma informação."
        />
      ) : (
        <View style={{ gap: theme.spacing.md }}>
          {insights.map((insight) => (
            <InsightCard key={insight.key} insight={insight} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

/** Average net profit per weekday, over whatever history was loaded. */
function weekdayAverages(rows: DayRow[]): { label: string; average: number }[] {
  const buckets = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    if (row.gross_revenue <= 0) continue;
    const label = weekdayLabel(row.date);
    const bucket = buckets.get(label) ?? { total: 0, count: 0 };
    bucket.total += row.net_profit;
    bucket.count += 1;
    buckets.set(label, bucket);
  }
  return [...buckets.entries()]
    .map(([label, b]) => ({ label, average: Math.round(b.total / b.count) }))
    .sort((a, b) => b.average - a.average);
}

function bestWeekday(rows: DayRow[]): { label: string; average: number } | null {
  const averages = weekdayAverages(rows);
  // With fewer than three distinct weekdays, "best day" is noise.
  return averages.length >= 3 ? averages[0]! : null;
}

function worstWeekday(
  rows: DayRow[],
): { label: string; average: number; overallAverage: number } | null {
  const averages = weekdayAverages(rows);
  if (averages.length < 3) return null;
  const worst = averages[averages.length - 1]!;
  const overall = Math.round(averages.reduce((acc, a) => acc + a.average, 0) / averages.length);
  return { ...worst, overallAverage: overall };
}
