import type { Cents, Metres, Millilitres } from '@dinamique/types';
import { KM, roundCents } from '@dinamique/utils';

/**
 * Vehicle economics (§31, §35). Every function refuses to answer without the
 * data it needs — an invented cost/km is worse than no cost/km.
 */

export interface FuelLogPoint {
  date: string;
  odometer: Metres | null;
  volume: Millilitres | null;
}

/** Minimum full-tank pairs before we trust a measured consumption figure. */
export const MIN_FUEL_LOGS_FOR_CONSUMPTION = 3;

export interface MeasuredConsumption {
  /** Metres per litre. */
  metresPerLitre: number;
  /** Number of odometer intervals that fed the calculation. */
  sampleSize: number;
  totalDistance: Metres;
  totalVolume: Millilitres;
}

/**
 * Tank-to-tank consumption: distance between consecutive odometer readings
 * divided by the volume that covered it. Logs without an odometer or volume
 * are skipped rather than approximated.
 */
export function computeMeasuredConsumption(
  logs: readonly FuelLogPoint[],
): MeasuredConsumption | null {
  const usable = logs
    .filter((l): l is FuelLogPoint & { odometer: Metres; volume: Millilitres } =>
      l.odometer !== null && l.volume !== null && l.volume > 0)
    .sort((a, b) => a.odometer - b.odometer);

  if (usable.length < MIN_FUEL_LOGS_FOR_CONSUMPTION) return null;

  let totalDistance = 0;
  let totalVolume = 0;
  let sampleSize = 0;

  // The first fill only marks a starting odometer; it fuels the next interval.
  for (let i = 1; i < usable.length; i += 1) {
    const previous = usable[i - 1]!;
    const current = usable[i]!;
    const distance = current.odometer - previous.odometer;
    if (distance <= 0) continue;
    totalDistance += distance;
    totalVolume += current.volume;
    sampleSize += 1;
  }

  if (sampleSize === 0 || totalVolume <= 0) return null;

  return {
    metresPerLitre: (totalDistance / totalVolume) * 1000,
    sampleSize,
    totalDistance,
    totalVolume,
  };
}

/**
 * Which consumption figure to use right now. The measured value is only
 * applied after the user explicitly accepted it — we never switch silently.
 */
export function resolveConsumption(vehicle: {
  estimatedConsumption: number | null;
  measuredConsumption: number | null;
  useMeasuredConsumption: boolean;
}): { value: number | null; source: 'measured' | 'estimated' | 'none' } {
  if (vehicle.useMeasuredConsumption && vehicle.measuredConsumption !== null) {
    return { value: vehicle.measuredConsumption, source: 'measured' };
  }
  if (vehicle.estimatedConsumption !== null) {
    return { value: vehicle.estimatedConsumption, source: 'estimated' };
  }
  return { value: null, source: 'none' };
}

/**
 * True when the measured figure differs enough from the catalogue estimate to
 * be worth asking the user about. Below this we stay quiet.
 */
export const CONSUMPTION_DIVERGENCE_THRESHOLD = 0.08;

export function shouldSuggestMeasuredConsumption(vehicle: {
  estimatedConsumption: number | null;
  measuredConsumption: number | null;
  useMeasuredConsumption: boolean;
}): boolean {
  if (vehicle.useMeasuredConsumption) return false;
  const { estimatedConsumption: est, measuredConsumption: measured } = vehicle;
  if (est === null || measured === null || est <= 0) return false;
  return Math.abs(measured - est) / est >= CONSUMPTION_DIVERGENCE_THRESHOLD;
}

export interface VehicleCostBreakdown {
  /** Vehicle-attributable spend over the window. */
  totalCost: Cents;
  distance: Metres;
  /** null without distance — see §6. */
  costPerKm: Cents | null;
  revenuePerKm: Cents | null;
  marginPerKm: Cents | null;
}

export function computeVehicleCost(input: {
  vehicleExpenses: Cents;
  /** Apportioned share of recurring costs for the same window. */
  apportionedRecurring: Cents;
  grossRevenue: Cents;
  distance: Metres;
}): VehicleCostBreakdown {
  const totalCost = input.vehicleExpenses + input.apportionedRecurring;
  const km = input.distance / KM;

  if (km <= 0) {
    return { totalCost, distance: input.distance, costPerKm: null, revenuePerKm: null, marginPerKm: null };
  }

  const costPerKm = roundCents(totalCost / km);
  const revenuePerKm = roundCents(input.grossRevenue / km);

  return {
    totalCost,
    distance: input.distance,
    costPerKm,
    revenuePerKm,
    marginPerKm: revenuePerKm - costPerKm,
  };
}

/**
 * Recurring costs are stated per period; a window of N days takes its
 * proportional slice. Explicitly an estimate, and labelled as such (§33).
 */
export function apportionRecurringCost(input: {
  amount: Cents;
  period: 'weekly' | 'monthly' | 'yearly';
  days: number;
}): Cents {
  const periodDays = input.period === 'weekly' ? 7 : input.period === 'monthly' ? 30 : 365;
  return roundCents((input.amount / periodDays) * Math.max(0, input.days));
}

/**
 * Suggested maintenance reserve (§47): a share of the day's profit, sized by
 * the driver's own historical maintenance cost per km. No money is moved.
 */
export function suggestMaintenanceReserve(input: {
  netProfitToday: Cents;
  historicalMaintenanceCost: Cents;
  historicalDistance: Metres;
  distanceToday: Metres;
}): Cents | null {
  if (input.netProfitToday <= 0) return null;
  if (input.historicalDistance <= 0 || input.distanceToday <= 0) return null;

  const perMetre = input.historicalMaintenanceCost / input.historicalDistance;
  const suggested = roundCents(perMetre * input.distanceToday);
  // Never suggest reserving more than the day actually produced.
  return Math.min(suggested, input.netProfitToday);
}
