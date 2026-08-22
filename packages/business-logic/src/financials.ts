import type { Cents, DateOnly, Metres, Seconds, UUID } from '@dinamique/types';
import { HOUR_SECONDS, KM, roundCents, sumCents } from '@dinamique/utils';

/**
 * The single source of truth for "how much did I actually make".
 *
 * Rules that are non-negotiable (PRODUCT_RULES.md §36, §6):
 *  - gross revenue is NEVER called profit;
 *  - a metric whose denominator is missing is `null`, never zero and never
 *    invented – no distance means no R$/km, full stop;
 *  - all money is integer cents.
 */

export interface JourneyInput {
  id: UUID;
  startedAt: string;
  endedAt: string | null;
  pausedSeconds: Seconds;
  odometerStart: Metres | null;
  odometerEnd: Metres | null;
  distanceOverride: Metres | null;
  /** Metres measured from a GPS track, when the driver turned capture on. */
  distanceGps: Metres | null;
}

export interface RevenueInput {
  date: DateOnly;
  amount: Cents;
  tips: Cents;
  tripCount: number | null;
  platformId: UUID | null;
}

export interface ExpenseInput {
  date: DateOnly;
  amount: Cents;
  /** Vehicle-attributable expenses feed cost-per-km; personal ones do not. */
  isVehicleCost: boolean;
}

export interface PeriodSummary {
  /** Everything the platforms paid, tips included. */
  grossRevenue: Cents;
  tips: Cents;
  /** Every expense recorded in the period. */
  totalExpenses: Cents;
  vehicleExpenses: Cents;
  /** grossRevenue - totalExpenses. Explicitly an estimate, never "lucro real". */
  netProfit: Cents;
  workedSeconds: Seconds;
  distance: Metres;
  tripCount: number;
  journeyCount: number;
  /** null when no time was worked. */
  revenuePerHour: Cents | null;
  profitPerHour: Cents | null;
  /** null when no distance was recorded – see §6. */
  revenuePerKm: Cents | null;
  profitPerKm: Cents | null;
  costPerKm: Cents | null;
  /** null when there are no trips recorded. */
  averageTicket: Cents | null;
  /** Expenses as a share of gross revenue; null when nothing was earned. */
  expenseRatio: number | null;
}

/**
 * Worked time excludes paused intervals. An unfinished journey contributes
 * nothing – we only measure what actually closed.
 */
export function journeyWorkedSeconds(journey: JourneyInput): Seconds {
  if (!journey.endedAt) return 0;
  const start = Date.parse(journey.startedAt);
  const end = Date.parse(journey.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  const elapsed = Math.floor((end - start) / 1000);
  return Math.max(0, elapsed - Math.max(0, journey.pausedSeconds));
}

/**
 * Distance resolution order: an explicit override wins, then an odometer pair,
 * then a GPS measurement. A single odometer reading is not a distance.
 *
 * The driver's own number always beats ours. GPS fills a gap the person left;
 * it never corrects a person who bothered to type. That is why capture writes
 * `distance_gps` and the close wizard merely *suggests* the figure in the km
 * field — accepting it is the driver's act, not ours (PRODUCT_RULES.md §6).
 *
 * Note the fall-through on a backwards odometer pair. It used to stop here and
 * return null; with a GPS figure available it has to keep going, which is what
 * the SQL in `daily_totals` always did. The two now agree.
 */
export function journeyDistance(journey: JourneyInput): Metres | null {
  if (journey.distanceOverride !== null && journey.distanceOverride > 0) {
    return journey.distanceOverride;
  }

  const { odometerStart: start, odometerEnd: end } = journey;
  if (start !== null && end !== null) {
    const delta = end - start;
    if (delta > 0) return delta;
  }

  if (journey.distanceGps !== null && journey.distanceGps > 0) {
    return journey.distanceGps;
  }

  return null;
}

/** Cents per unit, where `units` may legitimately be zero – hence the null. */
function perUnit(amount: Cents, units: number): Cents | null {
  if (units <= 0) return null;
  return roundCents(amount / units);
}

export function summarisePeriod(input: {
  journeys: readonly JourneyInput[];
  revenues: readonly RevenueInput[];
  expenses: readonly ExpenseInput[];
}): PeriodSummary {
  const { journeys, revenues, expenses } = input;

  const grossRevenue = sumCents(revenues.map((r) => r.amount + r.tips));
  const tips = sumCents(revenues.map((r) => r.tips));
  const totalExpenses = sumCents(expenses.map((e) => e.amount));
  const vehicleExpenses = sumCents(
    expenses.filter((e) => e.isVehicleCost).map((e) => e.amount),
  );
  const netProfit = grossRevenue - totalExpenses;

  const workedSeconds = journeys.reduce((acc, j) => acc + journeyWorkedSeconds(j), 0);

  let distance = 0;
  for (const journey of journeys) {
    distance += journeyDistance(journey) ?? 0;
  }

  const tripCount = revenues.reduce((acc, r) => acc + (r.tripCount ?? 0), 0);

  const hours = workedSeconds / HOUR_SECONDS;
  const km = distance / KM;

  return {
    grossRevenue,
    tips,
    totalExpenses,
    vehicleExpenses,
    netProfit,
    workedSeconds,
    distance,
    tripCount,
    journeyCount: journeys.length,
    revenuePerHour: perUnit(grossRevenue, hours),
    profitPerHour: perUnit(netProfit, hours),
    revenuePerKm: perUnit(grossRevenue, km),
    profitPerKm: perUnit(netProfit, km),
    costPerKm: perUnit(vehicleExpenses, km),
    averageTicket: perUnit(grossRevenue, tripCount),
    expenseRatio: grossRevenue > 0 ? totalExpenses / grossRevenue : null,
  };
}

export interface PlatformBreakdown {
  platformId: UUID | null;
  grossRevenue: Cents;
  tripCount: number;
  averageTicket: Cents | null;
  /** Share of the period's gross revenue, 0..1. */
  share: number;
}

export function breakdownByPlatform(
  revenues: readonly RevenueInput[],
): PlatformBreakdown[] {
  const buckets = new Map<string, { id: UUID | null; gross: Cents; trips: number }>();

  for (const revenue of revenues) {
    const key = revenue.platformId ?? '__none__';
    const bucket = buckets.get(key) ?? { id: revenue.platformId, gross: 0, trips: 0 };
    bucket.gross += revenue.amount + revenue.tips;
    bucket.trips += revenue.tripCount ?? 0;
    buckets.set(key, bucket);
  }

  const total = [...buckets.values()].reduce((acc, b) => acc + b.gross, 0);

  return [...buckets.values()]
    .map((bucket) => ({
      platformId: bucket.id,
      grossRevenue: bucket.gross,
      tripCount: bucket.trips,
      averageTicket: perUnit(bucket.gross, bucket.trips),
      share: total > 0 ? bucket.gross / total : 0,
    }))
    .sort((a, b) => b.grossRevenue - a.grossRevenue);
}
