import type { Cents } from '@dinamique/types';
import { formatCents, formatPercent } from '@dinamique/utils';
import type { PeriodSummary } from './financials';

/**
 * Insights (§42) are rule-based comparisons, not generated text. Each rule is
 * a pure function of two summaries plus a threshold, so the same inputs always
 * produce the same sentence — testable, explainable, and translatable.
 *
 * Thresholds are admin-configurable (§104); the defaults live here.
 */

export type InsightKey =
  | 'profit_per_hour_trend'
  | 'worked_less_earned_more'
  | 'fuel_share'
  | 'cost_per_km_trend'
  | 'best_weekday'
  | 'weekday_below_average'
  | 'goal_streak';

export type InsightTone = 'positive' | 'negative' | 'neutral';

export interface Insight {
  key: InsightKey;
  tone: InsightTone;
  text: string;
  /** Magnitude that triggered the rule, for sorting by relevance. */
  magnitude: number;
}

export interface InsightThresholds {
  /** Minimum relative change before a trend is worth mentioning. */
  trendChange: number;
  /** Fuel share of gross revenue that warrants a callout. */
  fuelShare: number;
  /** How far below average a weekday must be. */
  weekdayGap: number;
  /** Consecutive days hitting goal before we celebrate it. */
  goalStreak: number;
}

export const DEFAULT_INSIGHT_THRESHOLDS: InsightThresholds = {
  trendChange: 0.05,
  fuelShare: 0.2,
  weekdayGap: 0.1,
  goalStreak: 3,
};

function relativeChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return (current - previous) / previous;
}

export interface InsightContext {
  current: PeriodSummary;
  previous: PeriodSummary;
  fuelSpend: Cents;
  /** Best and worst weekday by average net profit, when enough data exists. */
  bestWeekday: { label: string; average: Cents } | null;
  worstWeekday: { label: string; average: Cents; overallAverage: Cents } | null;
  goalStreakDays: number;
  thresholds?: Partial<InsightThresholds>;
}

export function generateInsights(context: InsightContext): Insight[] {
  const t = { ...DEFAULT_INSIGHT_THRESHOLDS, ...context.thresholds };
  const { current, previous } = context;
  const insights: Insight[] = [];

  // Lucro/hora subiu ou caiu
  if (current.profitPerHour !== null && previous.profitPerHour !== null) {
    const change = relativeChange(current.profitPerHour, previous.profitPerHour);
    if (change !== null && Math.abs(change) >= t.trendChange) {
      insights.push({
        key: 'profit_per_hour_trend',
        tone: change > 0 ? 'positive' : 'negative',
        magnitude: Math.abs(change),
        text:
          change > 0
            ? `Seu lucro por hora aumentou ${formatPercent(Math.abs(change))} em relação ao período anterior.`
            : `Seu lucro por hora caiu ${formatPercent(Math.abs(change))} em relação ao período anterior.`,
      });
    }
  }

  // Trabalhou menos e lucrou mais — o insight mais valioso do produto
  if (
    current.workedSeconds > 0 &&
    previous.workedSeconds > 0 &&
    current.workedSeconds < previous.workedSeconds &&
    current.netProfit > previous.netProfit
  ) {
    const profitDelta = current.netProfit - previous.netProfit;
    const timeDelta = previous.workedSeconds - current.workedSeconds;
    insights.push({
      key: 'worked_less_earned_more',
      tone: 'positive',
      magnitude: profitDelta,
      text: `Você lucrou ${formatCents(profitDelta)} a mais trabalhando ${Math.round(timeDelta / 60)} minutos a menos.`,
    });
  }

  // Peso do combustível
  if (current.grossRevenue > 0 && context.fuelSpend > 0) {
    const share = context.fuelSpend / current.grossRevenue;
    if (share >= t.fuelShare) {
      insights.push({
        key: 'fuel_share',
        tone: 'negative',
        magnitude: share,
        text: `Combustível representou ${formatPercent(share)} do seu faturamento no período.`,
      });
    }
  }

  // Custo por km
  if (current.costPerKm !== null && previous.costPerKm !== null) {
    const change = relativeChange(current.costPerKm, previous.costPerKm);
    if (change !== null && Math.abs(change) >= t.trendChange) {
      insights.push({
        key: 'cost_per_km_trend',
        tone: change > 0 ? 'negative' : 'positive',
        magnitude: Math.abs(change),
        text:
          change > 0
            ? `Seu custo por km subiu ${formatPercent(Math.abs(change))}.`
            : `Seu custo por km caiu ${formatPercent(Math.abs(change))}.`,
      });
    }
  }

  if (context.bestWeekday) {
    insights.push({
      key: 'best_weekday',
      tone: 'neutral',
      magnitude: context.bestWeekday.average,
      text: `${capitalise(context.bestWeekday.label)} tem sido seu dia mais rentável.`,
    });
  }

  if (context.worstWeekday && context.worstWeekday.overallAverage > 0) {
    const gap =
      (context.worstWeekday.overallAverage - context.worstWeekday.average) /
      context.worstWeekday.overallAverage;
    if (gap >= t.weekdayGap) {
      insights.push({
        key: 'weekday_below_average',
        tone: 'negative',
        magnitude: gap,
        text: `${capitalise(context.worstWeekday.label)} está ${formatPercent(gap)} abaixo da sua média.`,
      });
    }
  }

  if (context.goalStreakDays >= t.goalStreak) {
    insights.push({
      key: 'goal_streak',
      tone: 'positive',
      magnitude: context.goalStreakDays,
      text: `Você bateu sua meta por ${context.goalStreakDays} dias seguidos.`,
    });
  }

  return insights;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
