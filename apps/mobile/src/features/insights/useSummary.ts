import { useCallback, useEffect, useState } from 'react';
import type { Cents, DateOnly, GoalBasis, GoalPeriod } from '@dinamique/types';
import {
  achievedForBasis,
  computeDailyScore,
  computeGoalProgress,
  goalStreakDays,
  projectPeriodTotal,
  summarisePeriod,
  type DailyScore,
  type GoalProgress,
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
  /**
   * The goal for the period on screen, and how it is going.
   *
   * Null when the driver has not set one. Never a zero target: a progress ring
   * against a goal nobody chose is an invented number (§6).
   */
  goal: GoalProgress | null;
  /** 'gross' or 'net', so the screen can name what is being counted. */
  goalBasis: GoalBasis;
  /**
   * Consecutive days the daily goal was met, counting back from today.
   *
   * Fed straight into `generateInsights`, which is where the "N dias seguidos"
   * sentence comes from. It used to be hard-coded to zero, so that insight
   * could never appear for anybody.
   */
  goalStreak: number;
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
      // `daily_totals` already resolved override, odometer and GPS into one
      // figure, so the highest-priority slot is where it belongs — resolving
      // it a second time here would be the divergence §120 forbids.
      odometerStart: null,
      odometerEnd: null,
      distanceOverride: row.distance > 0 ? row.distance : null,
      distanceGps: null,
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
      // Every active goal, not only the daily one. The score and the streak
      // are daily questions; the card on screen asks about the period the
      // driver is looking at, and two queries for one table is a round trip
      // nobody needs.
      supabase
        .from('goals')
        .select('period, target, basis')
        .eq('user_id', session.user.id)
        .eq('is_active', true),
    ]);

    const all = (rowsResult.data as DayRow[] | null) ?? [];
    const currentRows = all.filter((row) => row.date >= current.start);
    const previousRows = all.filter((row) => row.date < current.start);

    const summary = summariseRows(currentRows);
    const previousSummary = summariseRows(previousRows);

    const todayRow = all.find((row) => row.date === today);
    const todaySummary = todayRow ? summariseRows([todayRow]) : null;

    const goals = new Map(
      ((goalResult.data as { period: GoalPeriod; target: Cents; basis: GoalBasis }[] | null) ?? [])
        .map((row) => [row.period, row]),
    );
    const dailyGoal = goals.get('daily') ?? null;
    const periodGoal = goals.get(period) ?? null;
    const goalTarget = dailyGoal?.target ?? null;
    // The basis is one choice across every period, so whichever goal exists
    // answers it. Falling back to the period's own goal keeps the label
    // honest for a driver who only ever set a monthly one.
    const goalBasis: GoalBasis = dailyGoal?.basis ?? periodGoal?.basis ?? 'gross';

    const score = computeDailyScore({
      goalTarget,
      goalAchieved: todayRow
        ? goalBasis === 'gross'
          ? todayRow.gross_revenue
          : todayRow.net_profit
        : 0,
      profitPerHourToday: todaySummary?.profitPerHour ?? null,
      // A média pessoal vem do período, não do dia – comparar hoje com hoje
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
      goal: periodGoal
        ? computeGoalProgress({
            target: periodGoal.target,
            achieved: achievedForBasis(summary, periodGoal.basis),
            period,
            today,
          })
        : null,
      goalBasis,
      goalStreak: goalTarget
        ? goalStreakDays({
            target: goalTarget,
            today,
            days: all.map((row) => ({
              date: row.date as DateOnly,
              achieved: goalBasis === 'gross' ? row.gross_revenue : row.net_profit,
            })),
          })
        : 0,
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
