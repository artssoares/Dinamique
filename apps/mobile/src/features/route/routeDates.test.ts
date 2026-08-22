import { describe, expect, it } from 'vitest';
import { localDayRange, longDateLabel } from './routeDates';

describe('localDayRange', () => {
  it('starts at local midnight, not UTC midnight', () => {
    const { start } = localDayRange('2026-08-21');
    expect(new Date(start).getFullYear()).toBe(2026);
    expect(new Date(start).getMonth()).toBe(7);
    expect(new Date(start).getDate()).toBe(21);
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(start).getMinutes()).toBe(0);
  });

  it('ends at the next local midnight, so the window is half-open', () => {
    const { end } = localDayRange('2026-08-21');
    expect(new Date(end).getDate()).toBe(22);
    expect(new Date(end).getHours()).toBe(0);
  });

  it('spans exactly one day', () => {
    const { start, end } = localDayRange('2026-08-21');
    expect(Date.parse(end) - Date.parse(start)).toBe(86_400_000);
  });

  it('rolls the month over at its end', () => {
    const { end } = localDayRange('2026-08-31');
    expect(new Date(end).getMonth()).toBe(8);
    expect(new Date(end).getDate()).toBe(1);
  });

  it('leaves no gap between consecutive days', () => {
    expect(localDayRange('2026-08-21').end).toBe(localDayRange('2026-08-22').start);
  });
});

describe('longDateLabel', () => {
  it('writes the day out in Portuguese', () => {
    const label = longDateLabel('2026-08-21');
    expect(label).toContain('21');
    expect(label.toLowerCase()).toContain('agosto');
  });
});
