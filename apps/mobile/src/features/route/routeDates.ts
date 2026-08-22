import type { DateOnly } from '@dinamique/types';
import { addDays, fromDateOnly } from '@dinamique/utils';

/**
 * The instants that bound one of the driver's days.
 *
 * The history lists calendar days — `daily_totals` is one row per user per
 * local day — while `journeys.started_at` is a `timestamptz`. Asking for the
 * journeys of a day therefore means turning a `YYYY-MM-DD` into the two
 * instants that surround it *where the driver lives*, which is what
 * `fromDateOnly` builds: local midnight, not UTC midnight.
 *
 * Getting this wrong is not a rounding error. In São Paulo, UTC midnight is
 * 21:00 the previous day, so a UTC window would hand the driver the evening of
 * the day before and hide their own evening — the busiest hours of a shift.
 *
 * The upper bound is the next local midnight and the query that uses it must
 * be half-open (`< end`), so a journey that started at 23:59:59.7 belongs to
 * exactly one day and no journey belongs to two.
 */
export function localDayRange(date: DateOnly): { start: string; end: string } {
  return {
    start: fromDateOnly(date).toISOString(),
    end: fromDateOnly(addDays(date, 1)).toISOString(),
  };
}

/** "quinta, 21 de agosto" — the replay header, and the story card's date line. */
export function longDateLabel(date: DateOnly): string {
  return fromDateOnly(date).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}
