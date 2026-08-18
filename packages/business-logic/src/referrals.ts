import type { BenefitStatus, Cents, Timestamp, UUID } from '@dinamique/types';
import { applyDiscount } from '@dinamique/utils';

/**
 * Referral benefit rules (§83, §84).
 *
 * V1 commercial rule: the REFERRED user receives R$ 10 off their first
 * eligible Pro charge. The referrer receives nothing automatically — that is a
 * commercial decision, not an engineering one, and the schema is ready for it.
 */

export const DEFAULT_REFERRAL_DISCOUNT: Cents = 1000; // R$ 10,00
export const DEFAULT_BENEFIT_VALIDITY_DAYS = 90;

export interface BenefitRecord {
  id: UUID;
  userId: UUID;
  amount: Cents;
  status: BenefitStatus;
  expiresAt: Timestamp | null;
  usedAt: Timestamp | null;
}

/** What happens when the bill is smaller than the discount (§84). */
export type RemainderPolicy = 'forfeit' | 'keep_remainder';

export interface RedemptionResult {
  applied: boolean;
  charged: Cents;
  discountUsed: Cents;
  /** Amount still available afterwards under `keep_remainder`. */
  discountRemaining: Cents;
  nextStatus: BenefitStatus;
}

export function isBenefitRedeemable(benefit: BenefitRecord, now: Timestamp): boolean {
  if (benefit.status !== 'granted') return false;
  if (benefit.usedAt !== null) return false;
  if (benefit.expiresAt && Date.parse(benefit.expiresAt) <= Date.parse(now)) return false;
  return benefit.amount > 0;
}

/**
 * Applies a benefit to a charge. Never produces a negative charge, and a
 * benefit can only ever be consumed once (§85).
 */
export function redeemBenefit(input: {
  benefit: BenefitRecord;
  amountDue: Cents;
  now: Timestamp;
  remainderPolicy?: RemainderPolicy;
}): RedemptionResult {
  const { benefit, amountDue, now } = input;
  const policy = input.remainderPolicy ?? 'forfeit';

  if (!isBenefitRedeemable(benefit, now)) {
    return {
      applied: false,
      charged: Math.max(0, amountDue),
      discountUsed: 0,
      discountRemaining: 0,
      nextStatus: benefit.status,
    };
  }

  const { charged, discountUsed, discountRemaining } = applyDiscount(amountDue, benefit.amount);

  const keeps = policy === 'keep_remainder' && discountRemaining > 0;
  return {
    applied: discountUsed > 0,
    charged,
    discountUsed,
    discountRemaining: keeps ? discountRemaining : 0,
    nextStatus: keeps ? 'granted' : 'used',
  };
}

export type ReferralRejection =
  | 'self_referral'
  | 'already_attributed'
  | 'referrer_not_found'
  | 'referrer_blocked';

/**
 * Antifraude V1 (§70, §85) — deliberately simple and deterministic. Anything
 * heavier belongs in a later version backed by real abuse data.
 */
export function evaluateReferralEligibility(input: {
  referrerUserId: UUID | null;
  referredUserId: UUID;
  referrerIsBlocked: boolean;
  referredHasAttribution: boolean;
}): { eligible: true } | { eligible: false; reason: ReferralRejection } {
  if (input.referrerUserId === null) {
    return { eligible: false, reason: 'referrer_not_found' };
  }
  if (input.referrerUserId === input.referredUserId) {
    return { eligible: false, reason: 'self_referral' };
  }
  if (input.referrerIsBlocked) {
    return { eligible: false, reason: 'referrer_blocked' };
  }
  if (input.referredHasAttribution) {
    return { eligible: false, reason: 'already_attributed' };
  }
  return { eligible: true };
}
