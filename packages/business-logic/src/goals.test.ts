import { describe, expect, it } from 'vitest';
import {
  computeGoalProgress,
  deriveGoalSuggestions,
  estimateSecondsToGoal,
} from './goals';
import { estimateGoalReachDate, projectPeriodTotal } from './projections';

describe('computeGoalProgress', () => {
  it('clamps progress at 100% when the goal is exceeded', () => {
    const p = computeGoalProgress({
      target: 30_000,
      achieved: 45_000,
      period: 'daily',
      today: '2026-08-18',
    });
    expect(p.ratio).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.isReached).toBe(true);
    expect(p.requiredPerRemainingDay).toBeNull();
  });

  it('spreads the shortfall over the remaining days', () => {
    // Monthly goal, day 18 of a 31-day month → 13 days left.
    const p = computeGoalProgress({
      target: 700_000,
      achieved: 485_000,
      period: 'monthly',
      today: '2026-08-18',
    });
    expect(p.daysTotal).toBe(31);
    expect(p.daysElapsed).toBe(18);
    expect(p.daysRemaining).toBe(13);
    expect(p.remaining).toBe(215_000);
    expect(p.requiredPerRemainingDay).toBe(16_538);
  });

  it('charges the whole shortfall to the last day when nothing remains', () => {
    const p = computeGoalProgress({
      target: 30_000,
      achieved: 20_000,
      period: 'daily',
      today: '2026-08-18',
    });
    expect(p.daysRemaining).toBe(0);
    expect(p.requiredPerRemainingDay).toBe(10_000);
  });

  it('flags being on track from the observed pace', () => {
    const onTrack = computeGoalProgress({
      target: 700_000,
      achieved: 500_000,
      period: 'monthly',
      today: '2026-08-18',
    });
    expect(onTrack.projectedTotal).toBe(861_118);
    expect(onTrack.onTrack).toBe(true);

    const behind = computeGoalProgress({
      target: 700_000,
      achieved: 200_000,
      period: 'monthly',
      today: '2026-08-18',
    });
    expect(behind.onTrack).toBe(false);
  });

  it('does not divide by zero with a target of zero', () => {
    const p = computeGoalProgress({ target: 0, achieved: 0, period: 'daily', today: '2026-08-18' });
    expect(p.ratio).toBe(0);
    expect(p.isReached).toBe(false);
  });
});

describe('estimateSecondsToGoal', () => {
  it('extrapolates from the rate observed today', () => {
    // R$ 186 in 5h → R$ 37.2/h; R$ 114 remaining → ~3h04
    const seconds = estimateSecondsToGoal({
      remaining: 11_400,
      achievedToday: 18_600,
      workedSecondsToday: 5 * 3600,
    });
    expect(seconds).toBe(11_032);
  });

  it('returns zero once the goal is met', () => {
    expect(
      estimateSecondsToGoal({ remaining: 0, achievedToday: 30_000, workedSecondsToday: 3600 }),
    ).toBe(0);
  });

  it('refuses to guess without a rate', () => {
    expect(
      estimateSecondsToGoal({ remaining: 10_000, achievedToday: 0, workedSecondsToday: 3600 }),
    ).toBeNull();
    expect(
      estimateSecondsToGoal({ remaining: 10_000, achievedToday: 5_000, workedSecondsToday: 0 }),
    ).toBeNull();
  });
});

describe('deriveGoalSuggestions', () => {
  it('derives period targets from the monthly goal', () => {
    const s = deriveGoalSuggestions(700_000);
    expect(s.monthly).toBe(700_000);
    expect(s.daily).toBe(23_333);
    expect(s.weekly).toBe(161_105);
    expect(s.yearly).toBe(8_400_000);
  });
});

describe('projectPeriodTotal', () => {
  it('withholds confidence below the minimum sample of days', () => {
    const early = projectPeriodTotal({ achieved: 20_000, period: 'monthly', today: '2026-08-02' });
    expect(early?.hasEnoughData).toBe(false);

    const later = projectPeriodTotal({ achieved: 200_000, period: 'monthly', today: '2026-08-10' });
    expect(later?.hasEnoughData).toBe(true);
  });

  it('extrapolates the month linearly', () => {
    const p = projectPeriodTotal({ achieved: 485_000, period: 'monthly', today: '2026-08-18' });
    expect(p?.pacePerDay).toBe(26_944);
    expect(p?.projectedTotal).toBe(835_264);
  });
});

describe('estimateGoalReachDate', () => {
  it('names the day the goal is met at the current pace', () => {
    const date = estimateGoalReachDate({
      target: 700_000,
      achieved: 485_000,
      period: 'monthly',
      today: '2026-08-18',
    });
    expect(date).toBe('2026-08-26');
  });

  it('returns null when the pace cannot reach the goal in time', () => {
    const date = estimateGoalReachDate({
      target: 700_000,
      achieved: 100_000,
      period: 'monthly',
      today: '2026-08-18',
    });
    expect(date).toBeNull();
  });

  it('returns today when the goal is already met', () => {
    expect(
      estimateGoalReachDate({ target: 100, achieved: 500, period: 'monthly', today: '2026-08-18' }),
    ).toBe('2026-08-18');
  });
});
