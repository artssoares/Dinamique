import { useCallback, useEffect, useState } from 'react';
import type { Cents, DateOnly } from '@dinamique/types';
import {
  computeGoalProgress,
  estimateSecondsToGoal,
  sumDays,
  type GoalProgress,
  type PeriodTotals,
} from '@dinamique/business-logic';
import { startOfWeek, toDateOnly } from '@dinamique/utils';
import { supabase } from '../lib/supabase';
import { useSession } from './useSession';

/**
 * Everything the Home screen needs, in one query per concern.
 *
 * The aggregation happens in the `daily_totals` view; the interpretation
 * happens in @dinamique/business-logic. This hook only wires them together –
 * no arithmetic lives in a screen (§120).
 */

export interface TodayData {
  date: DateOnly;
  grossRevenue: Cents;
  totalExpenses: Cents;
  netProfit: Cents;
  workedSeconds: number;
  distance: number;
  revenuePerHour: Cents | null;
  profitPerHour: Cents | null;
  revenuePerKm: Cents | null;
  goal: GoalProgress | null;
  goalBasis: 'gross' | 'net';
  secondsToGoal: number | null;
  hasAnyData: boolean;
  /**
   * Monday to today, this week. The second thing a driver checks after the
   * day, and the reason the hero deck has a third card worth turning over.
   */
  week: PeriodTotals;
}

interface DailyTotalsRow {
  date: string;
  gross_revenue: number;
  total_expenses: number;
  net_profit: number;
  worked_seconds: number;
  distance: number;
}

function perUnit(amount: Cents, units: number): Cents | null {
  if (units <= 0) return null;
  return Math.round(amount / units);
}

export function useToday(): { data: TodayData | null; loading: boolean; refresh: () => Promise<void> } {
  const { session } = useSession();
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setData(null);
      setLoading(false);
      return;
    }

    const today = toDateOnly(new Date());

    // One query, not two: the week already contains today, so asking for the
    // range and picking today's row out of it costs one round trip instead of
    // two and cannot return a day that disagrees with itself.
    const [totalsResult, goalResult] = await Promise.all([
      supabase
        .from('daily_totals')
        .select('date, gross_revenue, total_expenses, net_profit, worked_seconds, distance')
        .eq('user_id', session.user.id)
        .gte('date', startOfWeek(today))
        .lte('date', today),
      supabase
        .from('goals')
        .select('target, basis')
        .eq('user_id', session.user.id)
        .eq('period', 'daily')
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    const weekRows = (totalsResult.data as DailyTotalsRow[] | null) ?? [];
    const row = weekRows.find((day) => day.date === today) ?? null;

    const week = sumDays(
      weekRows.map((day) => ({
        grossRevenue: day.gross_revenue as Cents,
        totalExpenses: day.total_expenses as Cents,
        netProfit: day.net_profit as Cents,
        workedSeconds: day.worked_seconds,
        distance: day.distance,
      })),
    );

    const grossRevenue = row?.gross_revenue ?? 0;
    const totalExpenses = row?.total_expenses ?? 0;
    const netProfit = row?.net_profit ?? 0;
    const workedSeconds = row?.worked_seconds ?? 0;
    const distance = row?.distance ?? 0;

    const basis = (goalResult.data?.basis as 'gross' | 'net' | undefined) ?? 'gross';
    const achieved = basis === 'gross' ? grossRevenue : netProfit;

    const goal = goalResult.data
      ? computeGoalProgress({
          target: goalResult.data.target as Cents,
          achieved,
          period: 'daily',
          today,
        })
      : null;

    setData({
      date: today,
      grossRevenue,
      totalExpenses,
      netProfit,
      workedSeconds,
      distance,
      revenuePerHour: perUnit(grossRevenue, workedSeconds / 3600),
      profitPerHour: perUnit(netProfit, workedSeconds / 3600),
      // Null without distance – never an invented R$/km (§6).
      revenuePerKm: perUnit(grossRevenue, distance / 1000),
      goal,
      goalBasis: basis,
      secondsToGoal: goal
        ? estimateSecondsToGoal({
            remaining: goal.remaining,
            achievedToday: achieved,
            workedSecondsToday: workedSeconds,
          })
        : null,
      hasAnyData: grossRevenue > 0 || totalExpenses > 0 || workedSeconds > 0,
      week,
    });
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, refresh };
}
