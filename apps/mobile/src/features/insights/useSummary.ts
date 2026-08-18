import { useCallback, useEffect, useState } from 'react';
import type { Cents, DateOnly, GoalPeriod } from '@dinamique/types';
import {
  computeDailyScore,
  projectPeriodTotal,
  summarisePeriod,
  type DailyScore,
  type PeriodSummary,
  type Projection,
} from '@dinamique/business-logic';
import { addDays, periodRange, toDateOnly, weekdayLabel } from '@dinamique/utils';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export interface DayRow {
  date: string;
  gross_revenue: number;
  total_expenses: number;
  vehicle_expenses: number;
  net_profit: number;
  worked_seconds: number;
  distance: number;
  trip_count: number;
}

export interface PeriodReport {
  summary: PeriodSummary;
  previous: PeriodSummary;
  projection: Projection | null;
  score: DailyScore;
  bestDay: { date: DateOnly; profit: Cents } | null;
  bestWeekday: { label: string; average: Cents } | null;
  worstWeekday: { label: string; average: Cents; overallAverage: Cents } | null;
  fuelSpend: Cents;
  daysWithData: number;
  rows: DayRow[];
}

/**
 * Converte linhas diárias no formato que a camada de regras entende.
 *
 * Cada dia vira uma "jornada sintética": o agregado do banco já somou o tempo
 * trabalhado, e assim a mesma função de cálculo serve para a Home, o histórico
 * e os insights, sem ninguém refazer a conta (§120).
 */
export function summariseRows(rows: DayRow[]): PeriodSummary {
  return summarisePeriod({
    journeys: rows.map((row) => ({
      id: row.date,
      startedAt: `${row.date}T00:00:00.000Z`,
      endedAt: new Date(
        Date.parse(`${row.date}T00:00:00.000Z`) + row.worked_seconds * 1000,
      ).toISOString(),
      pausedSeconds: 0,
      odometerStart: null,
      odometerEnd: null,
      distanceOverride: row.distance > 0 ? row.distance : null,
    })),
    revenues: rows.map((row) => ({
      date: row.date,
      amount: row.gross_revenue,
      tips: 0,
      tripCount: row.trip_count || null,
      platformId: null,
    })),
    expenses: [
      ...rows.map((row) => ({ date: row.date, amount: row.vehicle_expenses, isVehicleCost: true })),
      ...rows.map((row) => ({
        date: row.date,
        amount: row.total_expenses - row.vehicle_expenses,
        isVehicleCost: false,
      })),
    ],
  });
}

export function usePeriodReport(period: GoalPeriod) {
  const { session } = useSession();
  const [report, setReport] = useState<PeriodReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);

    const today = toDateOnly(new Date());
    const current = periodRange(period, today);
    const length = Math.max(
      1,
      Math.round(
        (Date.parse(current.end) - Date.parse(current.start)) / 86_400_000,
      ) + 1,
    );
    const previous = {
      start: addDays(current.start, -length),
      end: addDays(current.end, -length),
    };

    const [rowsResult, fuelResult, goalResult] = await Promise.all([
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
      supabase
        .from('goals')
        .select('target, basis')
        .eq('user_id', session.user.id)
        .eq('period', 'daily')
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    const all = (rowsResult.data as DayRow[] | null) ?? [];
    const currentRows = all.filter((row) => row.date >= current.start);
    const previousRows = all.filter((row) => row.date < current.start);

    const summary = summariseRows(currentRows);
    const previousSummary = summariseRows(previousRows);

    const todayRow = all.find((row) => row.date === today);
    const todaySummary = todayRow ? summariseRows([todayRow]) : null;

    const goalTarget = (goalResult.data?.target as Cents | undefined) ?? null;
    const goalBasis = (goalResult.data?.basis as 'gross' | 'net' | undefined) ?? 'gross';

    const score = computeDailyScore({
      goalTarget,
      goalAchieved: todayRow
        ? goalBasis === 'gross'
          ? todayRow.gross_revenue
          : todayRow.net_profit
        : 0,
      profitPerHourToday: todaySummary?.profitPerHour ?? null,
      // A média pessoal vem do período, não do dia — comparar hoje com hoje
      // não diria nada.
      profitPerHourAverage: summary.profitPerHour,
      profitPerKmToday: todaySummary?.profitPerKm ?? null,
      profitPerKmAverage: summary.profitPerKm,
      expenseRatioToday: todaySummary?.expenseRatio ?? null,
      expenseRatioAverage: summary.expenseRatio,
    });

    const withData = currentRows.filter((row) => row.gross_revenue > 0 || row.worked_seconds > 0);

    const bestDay = withData.length
      ? withData.reduce((best, row) => (row.net_profit > best.net_profit ? row : best))
      : null;

    setReport({
      summary,
      previous: previousSummary,
      projection: projectPeriodTotal({
        achieved: goalBasis === 'gross' ? summary.grossRevenue : summary.netProfit,
        period,
        today,
      }),
      score,
      bestDay: bestDay ? { date: bestDay.date, profit: bestDay.net_profit } : null,
      ...weekdayStats(currentRows.concat(previousRows)),
      fuelSpend: ((fuelResult.data as { total_amount: number }[] | null) ?? []).reduce(
        (acc, row) => acc + row.total_amount,
        0,
      ),
      daysWithData: withData.length,
      rows: currentRows,
    });
    setLoading(false);
  }, [period, session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { report, loading, refresh: load };
}

/** Melhor e pior dia da semana, quando há variedade suficiente para significar algo. */
function weekdayStats(rows: DayRow[]) {
  const buckets = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    if (row.gross_revenue <= 0) continue;
    const label = weekdayLabel(row.date);
    const bucket = buckets.get(label) ?? { total: 0, count: 0 };
    bucket.total += row.net_profit;
    bucket.count += 1;
    buckets.set(label, bucket);
  }

  const averages = [...buckets.entries()]
    .map(([label, b]) => ({ label, average: Math.round(b.total / b.count) }))
    .sort((a, b) => b.average - a.average);

  if (averages.length < 3) {
    return { bestWeekday: null, worstWeekday: null };
  }

  const overall = Math.round(averages.reduce((acc, a) => acc + a.average, 0) / averages.length);
  return {
    bestWeekday: averages[0]!,
    worstWeekday: { ...averages[averages.length - 1]!, overallAverage: overall },
  };
}
