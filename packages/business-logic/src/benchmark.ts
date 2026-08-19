import type { Cents } from '@dinamique/types';

/**
 * Anonymous benchmark (§44). Two hard rules:
 *  1. a bucket below the minimum sample size produces NOTHING – not a blurred
 *     number, not a "poucos dados" figure, nothing;
 *  2. only aggregates ever leave this module. No identifiers, no per-user rows.
 */

/** Configurable by admin (§104), but never below this floor. */
export const MIN_BENCHMARK_SAMPLE = 20;

export interface BenchmarkBucket {
  /** Number of distinct users aggregated. */
  sampleSize: number;
  medianRevenuePerKm: Cents | null;
  medianProfitPerHour: Cents | null;
}

export interface BenchmarkComparison {
  peerValue: Cents;
  userValue: Cents;
  /** Signed relative difference, e.g. -0.11 for 11% below peers. */
  difference: number;
  sampleSize: number;
}

export function isBenchmarkEligible(
  bucket: Pick<BenchmarkBucket, 'sampleSize'>,
  minimum: number = MIN_BENCHMARK_SAMPLE,
): boolean {
  return bucket.sampleSize >= Math.max(MIN_BENCHMARK_SAMPLE, minimum);
}

export function compareToBenchmark(input: {
  userValue: Cents | null;
  bucket: BenchmarkBucket;
  metric: 'revenuePerKm' | 'profitPerHour';
  minimumSample?: number;
}): BenchmarkComparison | null {
  const { userValue, bucket, metric } = input;
  if (userValue === null) return null;
  if (!isBenchmarkEligible(bucket, input.minimumSample ?? MIN_BENCHMARK_SAMPLE)) return null;

  const peerValue =
    metric === 'revenuePerKm' ? bucket.medianRevenuePerKm : bucket.medianProfitPerHour;
  if (peerValue === null || peerValue <= 0) return null;

  return {
    peerValue,
    userValue,
    difference: (userValue - peerValue) / peerValue,
    sampleSize: bucket.sampleSize,
  };
}

/** Median in cents. Exported so the aggregation job and tests share one impl. */
export function medianCents(values: readonly Cents[]): Cents | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}
