import type { Cents, Metres, Seconds } from '@dinamique/types';

/**
 * Adding up days.
 *
 * The database already aggregates a day; nothing aggregates a week, and the
 * obvious place to do it — inside the hook that fetched the rows — is exactly
 * where arithmetic is not allowed to live. So it lives here, with a test, and
 * a screen only ever reads the result.
 */

/** One day as `daily_totals` reports it. */
export interface DayTotals {
  grossRevenue: Cents;
  totalExpenses: Cents;
  netProfit: Cents;
  workedSeconds: Seconds;
  distance: Metres;
}

export interface PeriodTotals extends DayTotals {
  /**
   * Days with something on them, which is not the same as days in the period.
   *
   * A driver who worked three days this week wants to read "3 dias", not "7".
   * The view only returns rows for days that have data, so this is a count of
   * what came back — never a denominator invented from the calendar.
   */
  daysWorked: number;
}

/** The empty period. Zero here is a real total, not a missing one. */
export const NO_TOTALS: PeriodTotals = {
  grossRevenue: 0,
  totalExpenses: 0,
  netProfit: 0,
  workedSeconds: 0,
  distance: 0,
  daysWorked: 0,
};

/**
 * Sums a run of days.
 *
 * A day counts as worked when it carries money or time. Distance alone does
 * not: a route can survive a day whose earnings were deleted, and counting it
 * would tell the driver they worked a day they did not.
 */
export function sumDays(days: readonly DayTotals[]): PeriodTotals {
  return days.reduce<PeriodTotals>(
    (total, day) => ({
      grossRevenue: total.grossRevenue + day.grossRevenue,
      totalExpenses: total.totalExpenses + day.totalExpenses,
      netProfit: total.netProfit + day.netProfit,
      workedSeconds: total.workedSeconds + day.workedSeconds,
      distance: total.distance + day.distance,
      daysWorked:
        total.daysWorked +
        (day.grossRevenue > 0 || day.totalExpenses > 0 || day.workedSeconds > 0 ? 1 : 0),
    }),
    { ...NO_TOTALS },
  );
}
