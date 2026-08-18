import type { Cents, DateOnly, GoalPeriod } from '@dinamique/types';
import { addDays, elapsedDays, periodRange, rangeLengthDays, roundCents } from '@dinamique/utils';

/**
 * Projections are linear extrapolations of the observed pace, nothing more.
 * The UI must always label them as estimates (§41).
 */

export interface Projection {
  /** Expected total at period end if the current pace holds. */
  projectedTotal: Cents;
  pacePerDay: Cents;
  daysElapsed: number;
  daysTotal: number;
  /** Confidence gate: below this many days of data we do not show projections. */
  hasEnoughData: boolean;
}

export const MIN_DAYS_FOR_PROJECTION = 3;

export function projectPeriodTotal(input: {
  achieved: Cents;
  period: GoalPeriod;
  today: DateOnly;
}): Projection | null {
  const range = periodRange(input.period, input.today);
  const daysTotal = rangeLengthDays(range);
  const daysElapsed = elapsedDays(range, input.today);
  if (daysElapsed <= 0) return null;

  const pacePerDay = roundCents(input.achieved / daysElapsed);
  return {
    projectedTotal: roundCents(pacePerDay * daysTotal),
    pacePerDay,
    daysElapsed,
    daysTotal,
    hasEnoughData: daysElapsed >= MIN_DAYS_FOR_PROJECTION,
  };
}

/**
 * "Neste ritmo, você atinge sua meta por volta do dia 27."
 * Returns null when the pace never reaches the target inside the period.
 */
export function estimateGoalReachDate(input: {
  target: Cents;
  achieved: Cents;
  period: GoalPeriod;
  today: DateOnly;
}): DateOnly | null {
  const { target, achieved, period, today } = input;
  if (achieved >= target) return today;

  const range = periodRange(period, today);
  const daysElapsed = elapsedDays(range, today);
  if (daysElapsed <= 0) return null;

  const pacePerDay = achieved / daysElapsed;
  if (pacePerDay <= 0) return null;

  const daysNeeded = Math.ceil((target - achieved) / pacePerDay);
  const reachDate = addDays(today, daysNeeded);
  return reachDate <= range.end ? reachDate : null;
}
