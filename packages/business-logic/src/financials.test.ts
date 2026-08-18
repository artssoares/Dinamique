import { describe, expect, it } from 'vitest';
import {
  breakdownByPlatform,
  journeyDistance,
  journeyWorkedSeconds,
  summarisePeriod,
  type ExpenseInput,
  type JourneyInput,
  type RevenueInput,
} from './financials';

const journey = (over: Partial<JourneyInput> = {}): JourneyInput => ({
  id: 'j1',
  startedAt: '2026-08-18T08:00:00.000Z',
  endedAt: '2026-08-18T16:00:00.000Z',
  pausedSeconds: 0,
  odometerStart: null,
  odometerEnd: null,
  distanceOverride: null,
  ...over,
});

const revenue = (over: Partial<RevenueInput> = {}): RevenueInput => ({
  date: '2026-08-18',
  amount: 0,
  tips: 0,
  tripCount: null,
  platformId: null,
  ...over,
});

const expense = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({
  date: '2026-08-18',
  amount: 0,
  isVehicleCost: true,
  ...over,
});

describe('journeyWorkedSeconds', () => {
  it('excludes paused time', () => {
    expect(journeyWorkedSeconds(journey({ pausedSeconds: 1800 }))).toBe(8 * 3600 - 1800);
  });

  it('returns zero for an unfinished journey', () => {
    expect(journeyWorkedSeconds(journey({ endedAt: null }))).toBe(0);
  });

  it('never returns a negative duration', () => {
    expect(journeyWorkedSeconds(journey({ pausedSeconds: 999_999 }))).toBe(0);
  });
});

describe('journeyDistance', () => {
  it('prefers an explicit override', () => {
    expect(
      journeyDistance(journey({ distanceOverride: 120_000, odometerStart: 0, odometerEnd: 50_000 })),
    ).toBe(120_000);
  });

  it('derives distance from an odometer pair', () => {
    expect(journeyDistance(journey({ odometerStart: 100_000, odometerEnd: 180_000 }))).toBe(80_000);
  });

  it('returns null with only one odometer reading', () => {
    expect(journeyDistance(journey({ odometerStart: 100_000 }))).toBeNull();
  });

  it('rejects a decreasing odometer', () => {
    expect(journeyDistance(journey({ odometerStart: 180_000, odometerEnd: 100_000 }))).toBeNull();
  });
});

describe('summarisePeriod', () => {
  it('separates gross revenue from profit', () => {
    const summary = summarisePeriod({
      journeys: [journey()],
      revenues: [revenue({ amount: 30_000 }), revenue({ amount: 12_000, tips: 500 })],
      expenses: [expense({ amount: 9_100 })],
    });

    expect(summary.grossRevenue).toBe(42_500);
    expect(summary.totalExpenses).toBe(9_100);
    expect(summary.netProfit).toBe(33_400);
    expect(summary.tips).toBe(500);
  });

  it('computes per-hour metrics from worked time', () => {
    const summary = summarisePeriod({
      journeys: [journey()], // 8h
      revenues: [revenue({ amount: 40_000 })],
      expenses: [expense({ amount: 8_000 })],
    });

    expect(summary.revenuePerHour).toBe(5_000);
    expect(summary.profitPerHour).toBe(4_000);
  });

  it('returns null per-km metrics when no distance was recorded (§6)', () => {
    const summary = summarisePeriod({
      journeys: [journey()],
      revenues: [revenue({ amount: 40_000 })],
      expenses: [expense({ amount: 8_000 })],
    });

    expect(summary.distance).toBe(0);
    expect(summary.revenuePerKm).toBeNull();
    expect(summary.profitPerKm).toBeNull();
    expect(summary.costPerKm).toBeNull();
  });

  it('computes per-km metrics once distance exists', () => {
    const summary = summarisePeriod({
      journeys: [journey({ distanceOverride: 200_000 })], // 200 km
      revenues: [revenue({ amount: 41_600 })],
      expenses: [expense({ amount: 14_800, isVehicleCost: true })],
    });

    expect(summary.revenuePerKm).toBe(208);
    expect(summary.costPerKm).toBe(74);
    expect(summary.profitPerKm).toBe(134);
  });

  it('excludes personal expenses from cost per km', () => {
    const summary = summarisePeriod({
      journeys: [journey({ distanceOverride: 100_000 })],
      revenues: [revenue({ amount: 20_000 })],
      expenses: [
        expense({ amount: 5_000, isVehicleCost: true }),
        expense({ amount: 3_000, isVehicleCost: false }),
      ],
    });

    expect(summary.totalExpenses).toBe(8_000);
    expect(summary.vehicleExpenses).toBe(5_000);
    expect(summary.costPerKm).toBe(50);
  });

  it('computes the average ticket only when trips are known', () => {
    const withTrips = summarisePeriod({
      journeys: [journey()],
      revenues: [revenue({ amount: 22_400, tripCount: 20 })],
      expenses: [],
    });
    expect(withTrips.averageTicket).toBe(1_120);

    const withoutTrips = summarisePeriod({
      journeys: [journey()],
      revenues: [revenue({ amount: 22_400 })],
      expenses: [],
    });
    expect(withoutTrips.averageTicket).toBeNull();
  });

  it('handles an entirely empty period without dividing by zero', () => {
    const summary = summarisePeriod({ journeys: [], revenues: [], expenses: [] });
    expect(summary.grossRevenue).toBe(0);
    expect(summary.netProfit).toBe(0);
    expect(summary.revenuePerHour).toBeNull();
    expect(summary.expenseRatio).toBeNull();
  });

  it('reports a negative profit when costs exceed revenue', () => {
    const summary = summarisePeriod({
      journeys: [journey()],
      revenues: [revenue({ amount: 5_000 })],
      expenses: [expense({ amount: 9_000 })],
    });
    expect(summary.netProfit).toBe(-4_000);
    expect(summary.profitPerHour).toBe(-500);
  });
});

describe('breakdownByPlatform', () => {
  it('groups, sorts and shares out revenue', () => {
    const rows = breakdownByPlatform([
      revenue({ platformId: 'uber', amount: 21_000, tripCount: 8 }),
      revenue({ platformId: '99', amount: 9_400, tripCount: 4 }),
      revenue({ platformId: 'ifood', amount: 6_100, tripCount: 7 }),
    ]);

    expect(rows.map((r) => r.platformId)).toEqual(['uber', '99', 'ifood']);
    expect(rows[0]!.averageTicket).toBe(2_625);
    expect(rows.reduce((acc, r) => acc + r.share, 0)).toBeCloseTo(1, 10);
  });
});
