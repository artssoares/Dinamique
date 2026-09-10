import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  elapsedDays,
  endOfMonth,
  friendlyDayLabel,
  lastDays,
  periodRange,
  rangeLengthDays,
  shortDateLabel,
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

describe('friendlyDayLabel', () => {
  it('names today and yesterday rather than printing a date', () => {
    expect(friendlyDayLabel('2026-09-04', '2026-09-04')).toBe('Hoje');
    expect(friendlyDayLabel('2026-09-03', '2026-09-04')).toBe('Ontem');
  });

  it('gives any other day its weekday and date', () => {
    expect(friendlyDayLabel('2026-09-01', '2026-09-04')).toBe('terça-feira, 1 de setembro');
  });
});

describe('shortDateLabel', () => {
  it('pads the day and abbreviates the month', () => {
    expect(shortDateLabel('2026-09-04')).toBe('04 set');
  });
});

describe('lastDays', () => {
  it('ends on the reference day and runs oldest first', () => {
    expect(lastDays('2026-09-10', 7)).toEqual([
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
      '2026-09-07',
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
    ]);
  });

  // A faixa da Home não pode encolher na virada do mês: sete dias são sete
  // dias em 1º de setembro como em qualquer outro dia.
  it('crosses a month boundary without losing a day', () => {
    expect(lastDays('2026-09-01', 3)).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
  });

  it('gives a single day for a count of one, and nothing for zero', () => {
    expect(lastDays('2026-09-10', 1)).toEqual(['2026-09-10']);
    expect(lastDays('2026-09-10', 0)).toEqual([]);
  });
});
