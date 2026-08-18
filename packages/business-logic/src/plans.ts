import type { PlanCode, PlanSource, Timestamp, UUID } from '@dinamique/types';

/**
 * Plan resolution (§56, §57). A user may hold several grants at once — a paid
 * subscription, a trial, an admin courtesy. The effective plan is whichever
 * currently-valid grant is most generous, and Free is always the floor: a
 * user is never locked out of the product (§57).
 */

export const TRIAL_DAYS = 7;

export interface PlanGrant {
  id: UUID;
  plan: PlanCode;
  source: PlanSource;
  startedAt: Timestamp;
  expiresAt: Timestamp | null;
  cancelledAt: Timestamp | null;
}

export interface EffectivePlan {
  plan: PlanCode;
  source: PlanSource | null;
  expiresAt: Timestamp | null;
  /** Whole days left; null when open-ended. */
  daysRemaining: number | null;
  isTrial: boolean;
}

export function isGrantActive(grant: PlanGrant, now: Timestamp): boolean {
  const t = Date.parse(now);
  if (grant.cancelledAt && Date.parse(grant.cancelledAt) <= t) return false;
  if (Date.parse(grant.startedAt) > t) return false;
  if (grant.expiresAt && Date.parse(grant.expiresAt) <= t) return false;
  return true;
}

/** Paid subscriptions outrank courtesies, which outrank trials. */
const SOURCE_RANK: Record<PlanSource, number> = {
  subscription: 5,
  partnership: 4,
  courtesy: 3,
  promotion: 2,
  trial: 1,
};

export function resolveEffectivePlan(
  grants: readonly PlanGrant[],
  now: Timestamp,
): EffectivePlan {
  const active = grants.filter((g) => isGrantActive(g, now) && g.plan === 'pro');

  if (active.length === 0) {
    return { plan: 'free', source: null, expiresAt: null, daysRemaining: null, isTrial: false };
  }

  const best = active.reduce((winner, candidate) => {
    const rankDelta = SOURCE_RANK[candidate.source] - SOURCE_RANK[winner.source];
    if (rankDelta !== 0) return rankDelta > 0 ? candidate : winner;
    // Same rank: the one that lasts longer wins; open-ended beats dated.
    if (winner.expiresAt === null) return winner;
    if (candidate.expiresAt === null) return candidate;
    return Date.parse(candidate.expiresAt) > Date.parse(winner.expiresAt) ? candidate : winner;
  });

  const daysRemaining =
    best.expiresAt === null
      ? null
      : Math.max(0, Math.ceil((Date.parse(best.expiresAt) - Date.parse(now)) / 86_400_000));

  return {
    plan: 'pro',
    source: best.source,
    expiresAt: best.expiresAt,
    daysRemaining,
    isTrial: best.source === 'trial',
  };
}

/**
 * Feature flags (§56). Gating lives in one table so a screen never hard-codes
 * "if pro". Free keeps the whole core loop — we restrict depth, not access.
 */
export const FEATURES = [
  'journey_tracking',
  'revenue_tracking',
  'expense_tracking',
  'fuel_tracking',
  'daily_goal',
  'history_basic',
  'support',
  'referrals',
  'history_unlimited',
  'insights_advanced',
  'benchmark',
  'projections',
  'export_xlsx',
  'export_csv',
  'multi_vehicle',
  'recurring_costs',
] as const;

export type Feature = (typeof FEATURES)[number];

const FREE_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  'journey_tracking',
  'revenue_tracking',
  'expense_tracking',
  'fuel_tracking',
  'daily_goal',
  'history_basic',
  'support',
  'referrals',
]);

export function hasFeature(plan: PlanCode, feature: Feature): boolean {
  return plan === 'pro' ? true : FREE_FEATURES.has(feature);
}

/** History window for Free, in days. Pro is unlimited. */
export const FREE_HISTORY_DAYS = 30;

export function buildTrialGrant(input: {
  id: UUID;
  startedAt: Timestamp;
  days?: number;
}): PlanGrant {
  const days = input.days ?? TRIAL_DAYS;
  const expires = new Date(Date.parse(input.startedAt) + days * 86_400_000);
  return {
    id: input.id,
    plan: 'pro',
    source: 'trial',
    startedAt: input.startedAt,
    expiresAt: expires.toISOString(),
    cancelledAt: null,
  };
}
