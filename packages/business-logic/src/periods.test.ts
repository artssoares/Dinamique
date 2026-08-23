import { describe, expect, it } from 'vitest';
import { NO_TOTALS, sumDays, type DayTotals } from './periods';

function day(partial: Partial<DayTotals>): DayTotals {
  return {
    grossRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    workedSeconds: 0,
    distance: 0,
    ...partial,
  };
}

describe('sumDays', () => {
  it('is zero for no days at all', () => {
    expect(sumDays([])).toEqual(NO_TOTALS);
  });

  it('adds every figure across the period', () => {
    const total = sumDays([
      day({ grossRevenue: 12_000, totalExpenses: 4_000, netProfit: 8_000, workedSeconds: 3_600, distance: 40_000 }),
      day({ grossRevenue: 8_000, totalExpenses: 1_000, netProfit: 7_000, workedSeconds: 1_800, distance: 15_000 }),
    ]);
    expect(total).toEqual({
      grossRevenue: 20_000,
      totalExpenses: 5_000,
      netProfit: 15_000,
      workedSeconds: 5_400,
      distance: 55_000,
      daysWorked: 2,
    });
  });

  it('counts a day of pure expense as worked', () => {
    // Filling the tank on a day off is still a day the driver dealt with the
    // car, and the week's costs would be wrong without it.
    expect(sumDays([day({ totalExpenses: 20_000, netProfit: -20_000 })]).daysWorked).toBe(1);
  });

  it('does not count a day that only carries a route', () => {
    // A drawing can outlive the earnings that were deleted from that day.
    // Counting it would tell the driver they worked a day they did not.
    expect(sumDays([day({ distance: 30_000 })]).daysWorked).toBe(0);
  });

  it('keeps a loss a loss', () => {
    expect(sumDays([day({ netProfit: 5_000 }), day({ netProfit: -9_000 })]).netProfit).toBe(-4_000);
  });
});
