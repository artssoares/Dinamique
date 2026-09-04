import type { DateOnly } from '@dinamique/types';

/**
 * Date helpers operating on `YYYY-MM-DD` strings in the user's local calendar.
 * We deliberately avoid Date arithmetic across timezones: a driver's "day" is
 * a calendar day where they live, not a UTC window.
 */

export function toDateOnly(date: Date): DateOnly {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDateOnly(value: DateOnly): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function addDays(value: DateOnly, days: number): DateOnly {
  const date = fromDateOnly(value);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
}

export function daysBetween(from: DateOnly, to: DateOnly): number {
  const a = fromDateOnly(from).getTime();
  const b = fromDateOnly(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Weeks start on Monday – the working week drivers actually plan around. */
export function startOfWeek(value: DateOnly): DateOnly {
  const date = fromDateOnly(value);
  const dow = (date.getDay() + 6) % 7;
  return addDays(value, -dow);
}

export function endOfWeek(value: DateOnly): DateOnly {
  return addDays(startOfWeek(value), 6);
}

export function startOfMonth(value: DateOnly): DateOnly {
  return `${value.slice(0, 7)}-01`;
}

export function endOfMonth(value: DateOnly): DateOnly {
  const date = fromDateOnly(value);
  return toDateOnly(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function startOfYear(value: DateOnly): DateOnly {
  return `${value.slice(0, 4)}-01-01`;
}

export function endOfYear(value: DateOnly): DateOnly {
  return `${value.slice(0, 4)}-12-31`;
}

export interface DateRange {
  start: DateOnly;
  end: DateOnly;
}

export type PeriodKind = 'daily' | 'weekly' | 'monthly' | 'yearly';

export function periodRange(kind: PeriodKind, reference: DateOnly): DateRange {
  switch (kind) {
    case 'daily':
      return { start: reference, end: reference };
    case 'weekly':
      return { start: startOfWeek(reference), end: endOfWeek(reference) };
    case 'monthly':
      return { start: startOfMonth(reference), end: endOfMonth(reference) };
    case 'yearly':
      return { start: startOfYear(reference), end: endOfYear(reference) };
  }
}

/** Inclusive day count of a range – the denominator for pace maths. */
export function rangeLengthDays(range: DateRange): number {
  return daysBetween(range.start, range.end) + 1;
}

/** Days already elapsed in a range as of `today`, clamped to the range. */
export function elapsedDays(range: DateRange, today: DateOnly): number {
  const total = rangeLengthDays(range);
  if (today < range.start) return 0;
  if (today > range.end) return total;
  return daysBetween(range.start, today) + 1;
}

export function isWithin(range: DateRange, value: DateOnly): boolean {
  return value >= range.start && value <= range.end;
}

const WEEKDAY_LABELS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
] as const;

export function weekdayLabel(value: DateOnly): string {
  return WEEKDAY_LABELS[fromDateOnly(value).getDay()] ?? '';
}

const MONTH_LABELS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

export function monthLabel(value: DateOnly): string {
  return MONTH_LABELS[fromDateOnly(value).getMonth()] ?? '';
}

/** "4 de setembro", the way a date is said out loud. */
export function longDayLabel(value: DateOnly): string {
  return `${fromDateOnly(value).getDate()} de ${monthLabel(value)}`;
}

/** "04 set", the compact form used in lists and chips. */
export function shortDateLabel(value: DateOnly): string {
  const date = fromDateOnly(value);
  return `${String(date.getDate()).padStart(2, '0')} ${monthLabel(value).slice(0, 3)}`;
}

/**
 * How a day is named to the driver: Hoje and Ontem by name, anything else by
 * its weekday and date. Someone fixing a forgotten Tuesday needs to read
 * "terça-feira, 2 de setembro", not a bare `2026-09-02`.
 */
export function friendlyDayLabel(value: DateOnly, today: DateOnly = toDateOnly(new Date())): string {
  if (value === today) return 'Hoje';
  if (value === addDays(today, -1)) return 'Ontem';
  if (value === addDays(today, 1)) return 'Amanhã';
  return `${weekdayLabel(value)}, ${longDayLabel(value)}`;
}
