import { describe, expect, it } from 'vitest';
import {
  buildTrialGrant,
  hasFeature,
  isGrantActive,
  resolveEffectivePlan,
  TRIAL_DAYS,
  type PlanGrant,
} from './plans';

const NOW = '2026-08-18T12:00:00.000Z';

const grant = (over: Partial<PlanGrant> = {}): PlanGrant => ({
  id: 'g1',
  plan: 'pro',
  source: 'subscription',
  startedAt: '2026-08-01T00:00:00.000Z',
  expiresAt: null,
  cancelledAt: null,
  ...over,
});

describe('resolveEffectivePlan', () => {
  it('falls back to Free with no grants', () => {
    const plan = resolveEffectivePlan([], NOW);
    expect(plan.plan).toBe('free');
    expect(plan.isTrial).toBe(false);
  });

  it('falls back to Free once the trial expires (§57)', () => {
    const trial = buildTrialGrant({ id: 't1', startedAt: '2026-08-01T00:00:00.000Z' });
    expect(resolveEffectivePlan([trial], NOW).plan).toBe('free');
  });

  it('keeps Pro while the trial is live', () => {
    const trial = buildTrialGrant({ id: 't1', startedAt: '2026-08-15T00:00:00.000Z' });
    const plan = resolveEffectivePlan([trial], NOW);
    expect(plan.plan).toBe('pro');
    expect(plan.isTrial).toBe(true);
    expect(plan.daysRemaining).toBe(4);
  });

  it('prefers a paid subscription over a concurrent trial', () => {
    const trial = buildTrialGrant({ id: 't1', startedAt: '2026-08-15T00:00:00.000Z' });
    const plan = resolveEffectivePlan([trial, grant()], NOW);
    expect(plan.source).toBe('subscription');
    expect(plan.isTrial).toBe(false);
    expect(plan.daysRemaining).toBeNull();
  });

  it('prefers the longer grant when sources tie', () => {
    const shorter = grant({ id: 'a', source: 'courtesy', expiresAt: '2026-08-20T00:00:00.000Z' });
    const longer = grant({ id: 'b', source: 'courtesy', expiresAt: '2026-12-20T00:00:00.000Z' });
    expect(resolveEffectivePlan([shorter, longer], NOW).expiresAt).toBe('2026-12-20T00:00:00.000Z');
  });

  it('ignores a cancelled grant', () => {
    const cancelled = grant({ cancelledAt: '2026-08-10T00:00:00.000Z' });
    expect(resolveEffectivePlan([cancelled], NOW).plan).toBe('free');
  });

  it('ignores a grant that has not started', () => {
    expect(isGrantActive(grant({ startedAt: '2026-09-01T00:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('buildTrialGrant', () => {
  it('grants 7 days of Pro by default (§57)', () => {
    const trial = buildTrialGrant({ id: 't1', startedAt: '2026-08-18T00:00:00.000Z' });
    expect(TRIAL_DAYS).toBe(7);
    expect(trial.expiresAt).toBe('2026-08-25T00:00:00.000Z');
    expect(trial.source).toBe('trial');
  });

  it('honours an admin-extended trial', () => {
    const trial = buildTrialGrant({ id: 't1', startedAt: '2026-08-18T00:00:00.000Z', days: 30 });
    expect(trial.expiresAt).toBe('2026-09-17T00:00:00.000Z');
  });
});

describe('hasFeature', () => {
  it('keeps the core loop available on Free (§57)', () => {
    expect(hasFeature('free', 'journey_tracking')).toBe(true);
    expect(hasFeature('free', 'revenue_tracking')).toBe(true);
    expect(hasFeature('free', 'daily_goal')).toBe(true);
    expect(hasFeature('free', 'support')).toBe(true);
  });

  it('reserves depth for Pro', () => {
    expect(hasFeature('free', 'benchmark')).toBe(false);
    expect(hasFeature('free', 'export_xlsx')).toBe(false);
    expect(hasFeature('free', 'projections')).toBe(false);
    expect(hasFeature('pro', 'benchmark')).toBe(true);
  });
});
