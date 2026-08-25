import type { Cents, DateOnly, GoalBasis, GoalPeriod } from '@dinamique/types';
import { addDays, elapsedDays, periodRange, rangeLengthDays, roundCents } from '@dinamique/utils';
import type { PeriodSummary } from './financials';

/**
 * Goal maths is fully deterministic – no model, no heuristics. Everything here
 * is arithmetic a driver could redo on paper, which is the point (§40).
 */

export interface GoalProgress {
  target: Cents;
  achieved: Cents;
  /** 0..1, clamped. Progress bars never overflow. */
  ratio: number;
  remaining: Cents;
  isReached: boolean;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  /** What's still needed per remaining day. null once the goal is reached. */
  requiredPerRemainingDay: Cents | null;
  /** Average per elapsed day so far. null before the period starts. */
  pacePerDay: Cents | null;
  /** Where the period ends if the current pace holds. */
  projectedTotal: Cents | null;
  /** True when the projection lands at or above target. */
  onTrack: boolean;
}

export function achievedForBasis(summary: PeriodSummary, basis: GoalBasis): Cents {
  return basis === 'gross' ? summary.grossRevenue : summary.netProfit;
}

export function computeGoalProgress(input: {
  target: Cents;
  achieved: Cents;
  period: GoalPeriod;
  today: DateOnly;
  /** Defaults to `today`; pass an explicit date to inspect a past period. */
  reference?: DateOnly;
}): GoalProgress {
  const { target, achieved, period, today } = input;
  const range = periodRange(period, input.reference ?? today);

  const daysTotal = rangeLengthDays(range);
  const daysElapsed = elapsedDays(range, today);
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);

  const ratio = target > 0 ? Math.min(1, Math.max(0, achieved / target)) : 0;
  const remaining = Math.max(0, target - achieved);
  const isReached = target > 0 && achieved >= target;

  const pacePerDay = daysElapsed > 0 ? roundCents(achieved / daysElapsed) : null;
  const projectedTotal = pacePerDay !== null ? roundCents(pacePerDay * daysTotal) : null;

  let requiredPerRemainingDay: Cents | null = null;
  if (!isReached && remaining > 0) {
    // With no days left the shortfall is due today, not spread over zero days.
    requiredPerRemainingDay =
      daysRemaining > 0 ? roundCents(remaining / daysRemaining) : remaining;
  }

  return {
    target,
    achieved,
    ratio,
    remaining,
    isReached,
    daysTotal,
    daysElapsed,
    daysRemaining,
    requiredPerRemainingDay,
    pacePerDay,
    projectedTotal,
    onTrack: projectedTotal !== null && target > 0 ? projectedTotal >= target : false,
  };
}

/**
 * "No ritmo atual, faltam ~2h05" on the Home screen.
 *
 * Uses the rate actually observed today; without worked time or earnings there
 * is no rate, and we say nothing rather than guess.
 */
export function estimateSecondsToGoal(input: {
  remaining: Cents;
  achievedToday: Cents;
  workedSecondsToday: number;
}): number | null {
  const { remaining, achievedToday, workedSecondsToday } = input;
  if (remaining <= 0) return 0;
  if (workedSecondsToday <= 0 || achievedToday <= 0) return null;
  const perSecond = achievedToday / workedSecondsToday;
  if (perSecond <= 0) return null;
  return Math.round(remaining / perSecond);
}

/**
 * How many days in a row, counting back, the daily goal was met.
 *
 * This is the number behind "você bateu sua meta por N dias seguidos", and
 * until now the screen passed a hard-coded zero, so that insight could never
 * fire for anybody. A streak is the one figure in the product that rewards
 * showing up rather than earning more, which is exactly why it is worth
 * getting right.
 *
 * Today is counted only once it has been met. A morning that has not reached
 * the target yet is a day still being worked, not a streak that broke, and
 * resetting the count at midnight every night would make it useless.
 *
 * A day with no record at all breaks the streak. That is deliberate: the
 * claim is "you hit your goal every day", and a day off did not hit it.
 * Callers pass the days they have, so a day outside the window read here
 * simply ends the count rather than reaching back for ever.
 */
export function goalStreakDays(input: {
  target: Cents;
  /** The days available, in any order. Missing days count as nothing earned. */
  days: readonly { date: DateOnly; achieved: Cents }[];
  today: DateOnly;
}): number {
  const { target, today } = input;
  if (target <= 0) return 0;

  const achieved = new Map(input.days.map((day) => [day.date, day.achieved]));
  const met = (date: DateOnly) => (achieved.get(date) ?? 0) >= target;

  let cursor: DateOnly = met(today) ? today : addDays(today, -1);
  let streak = 0;

  // Bounded by the days actually supplied: the first date with no row reads
  // as nothing earned and stops the walk.
  while (met(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }

  return streak;
}

/**
 * Suggested daily targets derived from a monthly goal. Deliberately naive –
 * an even split is predictable, and a driver can reason about it (§22 step 4).
 */
export function deriveGoalSuggestions(monthlyTarget: Cents): Record<GoalPeriod, Cents> {
  return {
    daily: roundCents(monthlyTarget / 30),
    weekly: roundCents(monthlyTarget / 4.345), // mean weeks per month
    monthly: monthlyTarget,
    yearly: monthlyTarget * 12,
  };
}
