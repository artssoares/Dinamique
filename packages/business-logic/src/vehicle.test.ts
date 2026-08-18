import { describe, expect, it } from 'vitest';
import {
  apportionRecurringCost,
  computeMeasuredConsumption,
  computeVehicleCost,
  resolveConsumption,
  shouldSuggestMeasuredConsumption,
  suggestMaintenanceReserve,
} from './vehicle';

describe('computeMeasuredConsumption', () => {
  it('measures consumption tank-to-tank', () => {
    const result = computeMeasuredConsumption([
      { date: '2026-08-01', odometer: 100_000_000, volume: 40_000 },
      { date: '2026-08-08', odometer: 100_400_000, volume: 40_000 },
      { date: '2026-08-15', odometer: 100_800_000, volume: 40_000 },
    ]);
    // 800 km over 80 L → 10 km/l → 10 000 m/l
    expect(result?.metresPerLitre).toBe(10_000);
    expect(result?.sampleSize).toBe(2);
  });

  it('refuses to answer below the minimum number of logs', () => {
    expect(
      computeMeasuredConsumption([
        { date: '2026-08-01', odometer: 100_000_000, volume: 40_000 },
        { date: '2026-08-08', odometer: 100_400_000, volume: 40_000 },
      ]),
    ).toBeNull();
  });

  it('ignores logs without an odometer or volume', () => {
    expect(
      computeMeasuredConsumption([
        { date: '2026-08-01', odometer: null, volume: 40_000 },
        { date: '2026-08-08', odometer: 100_400_000, volume: null },
        { date: '2026-08-15', odometer: 100_800_000, volume: 40_000 },
      ]),
    ).toBeNull();
  });
});

describe('resolveConsumption', () => {
  it('keeps the catalogue estimate until the user accepts the measured one (§31)', () => {
    const vehicle = {
      estimatedConsumption: 10_800,
      measuredConsumption: 9_700,
      useMeasuredConsumption: false,
    };
    expect(resolveConsumption(vehicle)).toEqual({ value: 10_800, source: 'estimated' });
    expect(resolveConsumption({ ...vehicle, useMeasuredConsumption: true })).toEqual({
      value: 9_700,
      source: 'measured',
    });
  });

  it('reports no consumption when nothing is known', () => {
    expect(
      resolveConsumption({
        estimatedConsumption: null,
        measuredConsumption: null,
        useMeasuredConsumption: false,
      }),
    ).toEqual({ value: null, source: 'none' });
  });

  it('only asks the user when the divergence is meaningful', () => {
    expect(
      shouldSuggestMeasuredConsumption({
        estimatedConsumption: 10_800,
        measuredConsumption: 9_700,
        useMeasuredConsumption: false,
      }),
    ).toBe(true);

    expect(
      shouldSuggestMeasuredConsumption({
        estimatedConsumption: 10_800,
        measuredConsumption: 10_700,
        useMeasuredConsumption: false,
      }),
    ).toBe(false);
  });
});

describe('computeVehicleCost', () => {
  it('derives cost, revenue and margin per km', () => {
    const result = computeVehicleCost({
      vehicleExpenses: 100_000,
      apportionedRecurring: 48_000,
      grossRevenue: 416_000,
      distance: 200_000_000, // 200 000 km? no — 200 000 m ×1000 = keep simple below
    });
    expect(result.costPerKm).not.toBeNull();
    expect(result.marginPerKm).toBe((result.revenuePerKm ?? 0) - (result.costPerKm ?? 0));
  });

  it('matches the worked example from the spec (§35)', () => {
    // 1 000 km, R$ 740 of vehicle cost, R$ 2 080 of revenue
    const result = computeVehicleCost({
      vehicleExpenses: 74_000,
      apportionedRecurring: 0,
      grossRevenue: 208_000,
      distance: 1_000_000,
    });
    expect(result.costPerKm).toBe(74);
    expect(result.revenuePerKm).toBe(208);
    expect(result.marginPerKm).toBe(134);
  });

  it('returns nulls without distance instead of inventing a rate (§6)', () => {
    const result = computeVehicleCost({
      vehicleExpenses: 74_000,
      apportionedRecurring: 0,
      grossRevenue: 208_000,
      distance: 0,
    });
    expect(result.costPerKm).toBeNull();
    expect(result.revenuePerKm).toBeNull();
    expect(result.marginPerKm).toBeNull();
  });
});

describe('apportionRecurringCost', () => {
  it('slices a monthly cost across a window', () => {
    expect(apportionRecurringCost({ amount: 60_000, period: 'monthly', days: 30 })).toBe(60_000);
    expect(apportionRecurringCost({ amount: 60_000, period: 'monthly', days: 1 })).toBe(2_000);
    expect(apportionRecurringCost({ amount: 365_000, period: 'yearly', days: 1 })).toBe(1_000);
  });

  it('never apportions a negative window', () => {
    expect(apportionRecurringCost({ amount: 60_000, period: 'monthly', days: -5 })).toBe(0);
  });
});

describe('suggestMaintenanceReserve', () => {
  it('sizes the reserve from historical maintenance per km', () => {
    const reserve = suggestMaintenanceReserve({
      netProfitToday: 25_100,
      historicalMaintenanceCost: 120_000,
      historicalDistance: 1_000_000_0, // 10 000 km
      distanceToday: 200_000, // 200 km
    });
    expect(reserve).toBe(2_400);
  });

  it('never suggests reserving more than the day produced', () => {
    const reserve = suggestMaintenanceReserve({
      netProfitToday: 1_000,
      historicalMaintenanceCost: 900_000,
      historicalDistance: 100_000,
      distanceToday: 100_000,
    });
    expect(reserve).toBe(1_000);
  });

  it('says nothing on a loss-making day or without distance', () => {
    expect(
      suggestMaintenanceReserve({
        netProfitToday: -500,
        historicalMaintenanceCost: 120_000,
        historicalDistance: 1_000_000,
        distanceToday: 200_000,
      }),
    ).toBeNull();

    expect(
      suggestMaintenanceReserve({
        netProfitToday: 25_100,
        historicalMaintenanceCost: 120_000,
        historicalDistance: 0,
        distanceToday: 200_000,
      }),
    ).toBeNull();
  });
});
