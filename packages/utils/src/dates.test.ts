import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  elapsedDays,
  endOfMonth,
  periodRange,
  rangeLengthDays,
  startOfWeek,
  weekdayLabel,
} from './dates';

describe('date ranges', () => {
  it('starts the week on Monday', () => {
    expect(startOfWeek('2026-08-18')).toBe('2026-08-17'); // Tuesday → Monday
    expect(startOfWeek('2026-08-16')).toBe('2026-08-10'); // Sunday → previous Monday
  });

  it('handles month boundaries and leap years', () => {
    expect(endOfMonth('2026-08-18')).toBe('2026-08-31');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });

  it('builds inclusive period ranges', () => {
    expect(periodRange('monthly', '2026-08-18')).toEqual({
      start: '2026-08-01',
      end: '2026-08-31',
    });
    expect(rangeLengthDays(periodRange('monthly', '2026-08-18'))).toBe(31);
    expect(rangeLengthDays(periodRange('daily', '2026-08-18'))).toBe(1);
  });

  it('counts elapsed days inclusively and clamps outside the range', () => {
    const range = periodRange('monthly', '2026-08-18');
    expect(elapsedDays(range, '2026-08-18')).toBe(18);
    expect(elapsedDays(range, '2026-07-30')).toBe(0);
    expect(elapsedDays(range, '2026-09-05')).toBe(31);
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetween('2026-08-01', '2026-08-18')).toBe(17);
  });

  it('labels weekdays in Portuguese', () => {
    expect(weekdayLabel('2026-08-21')).toBe('sexta-feira');
  });
});
