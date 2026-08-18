import { describe, expect, it } from 'vitest';
import { computeDailyScore, scoreLabel, type ScoreInput } from './score';
import { compareToBenchmark, medianCents, MIN_BENCHMARK_SAMPLE } from './benchmark';

const input = (over: Partial<ScoreInput> = {}): ScoreInput => ({
  goalTarget: 30_000,
  goalAchieved: 30_000,
  profitPerHourToday: 3_640,
  profitPerHourAverage: 3_180,
  profitPerKmToday: 200,
  profitPerKmAverage: 200,
  expenseRatioToday: 0.2,
  expenseRatioAverage: 0.2,
  ...over,
});

describe('computeDailyScore', () => {
  it('scores a day that matched the average at the midpoint', () => {
    const result = computeDailyScore(
      input({ goalTarget: null, profitPerHourToday: 3_180 }),
    );
    expect(result.score).toBe(5);
    expect(result.hasData).toBe(true);
  });

  it('rewards beating your own average', () => {
    const better = computeDailyScore(input());
    const matched = computeDailyScore(input({ profitPerHourToday: 3_180 }));
    expect(better.score).toBeGreaterThan(matched.score);
  });

  it('drops components with no data instead of defaulting them to zero', () => {
    const withoutKm = computeDailyScore(
      input({ profitPerKmToday: null, profitPerKmAverage: null }),
    );
    expect(withoutKm.components.map((c) => c.key)).not.toContain('profitKm');
    expect(withoutKm.score).toBeGreaterThan(0);
  });

  it('reports no data when nothing is measurable', () => {
    const empty = computeDailyScore({
      goalTarget: null,
      goalAchieved: 0,
      profitPerHourToday: null,
      profitPerHourAverage: null,
      profitPerKmToday: null,
      profitPerKmAverage: null,
      expenseRatioToday: null,
      expenseRatioAverage: null,
    });
    expect(empty.hasData).toBe(false);
    expect(empty.score).toBe(0);
  });

  it('stays inside 0..10', () => {
    const huge = computeDailyScore(
      input({ goalAchieved: 900_000, profitPerHourToday: 999_999, profitPerKmToday: 99_999, expenseRatioToday: 0 }),
    );
    expect(huge.score).toBeLessThanOrEqual(10);

    const awful = computeDailyScore(
      input({ goalAchieved: 0, profitPerHourToday: 0, profitPerKmToday: 0, expenseRatioToday: 5 }),
    );
    expect(awful.score).toBeGreaterThanOrEqual(0);
  });

  it('labels scores from fixed thresholds', () => {
    expect(scoreLabel(9)).toBe('Dia excelente');
    expect(scoreLabel(8.4)).toBe('Bom resultado');
    expect(scoreLabel(5.2)).toBe('Dia dentro da média');
    expect(scoreLabel(1)).toBe('Dia difícil');
  });
});

describe('benchmark', () => {
  const bucket = { sampleSize: 40, medianRevenuePerKm: 218, medianProfitPerHour: 3_400 };

  it('compares the user against the peer median', () => {
    const result = compareToBenchmark({ userValue: 194, bucket, metric: 'revenuePerKm' });
    expect(result?.peerValue).toBe(218);
    expect(result?.difference).toBeCloseTo(-0.11, 2);
  });

  it('produces nothing below the minimum sample (§44)', () => {
    const thin = { ...bucket, sampleSize: MIN_BENCHMARK_SAMPLE - 1 };
    expect(compareToBenchmark({ userValue: 194, bucket: thin, metric: 'revenuePerKm' })).toBeNull();
  });

  it('never raises the floor by passing a smaller minimum', () => {
    const thin = { ...bucket, sampleSize: 5 };
    expect(
      compareToBenchmark({ userValue: 194, bucket: thin, metric: 'revenuePerKm', minimumSample: 1 }),
    ).toBeNull();
  });

  it('produces nothing when the user has no value to compare', () => {
    expect(compareToBenchmark({ userValue: null, bucket, metric: 'revenuePerKm' })).toBeNull();
  });

  it('computes a median over odd and even samples', () => {
    expect(medianCents([100, 300, 200])).toBe(200);
    expect(medianCents([100, 200, 300, 500])).toBe(250);
    expect(medianCents([])).toBeNull();
  });
});
