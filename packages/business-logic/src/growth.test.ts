import { describe, expect, it } from 'vitest';
import {
  buildReferralCode,
  generateCodeSuffix,
  normaliseCode,
  validateCode,
  type CodeRecord,
} from './codes';
import {
  DEFAULT_REFERRAL_DISCOUNT,
  evaluateReferralEligibility,
  isBenefitRedeemable,
  redeemBenefit,
  type BenefitRecord,
} from './referrals';

const NOW = '2026-08-18T12:00:00.000Z';

const code = (over: Partial<CodeRecord> = {}): CodeRecord => ({
  id: 'c1',
  code: 'ARTHUR26',
  kind: 'referral',
  ownerUserId: 'user-arthur',
  benefitAmount: DEFAULT_REFERRAL_DISCOUNT,
  startsAt: null,
  expiresAt: null,
  maxUses: null,
  useCount: 0,
  status: 'active',
  ...over,
});

const benefit = (over: Partial<BenefitRecord> = {}): BenefitRecord => ({
  id: 'b1',
  userId: 'user-new',
  amount: DEFAULT_REFERRAL_DISCOUNT,
  status: 'granted',
  expiresAt: null,
  usedAt: null,
  ...over,
});

const ctx = (over: Partial<Parameters<typeof validateCode>[1]> = {}) => ({
  redeemingUserId: 'user-new',
  hasExistingAttribution: false,
  now: NOW,
  ...over,
});

describe('validateCode', () => {
  it('accepts a valid active code', () => {
    const result = validateCode(code(), ctx());
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.benefitAmount).toBe(1000);
  });

  it('rejects a missing code', () => {
    expect(validateCode(null, ctx())).toEqual({ valid: false, reason: 'not_found' });
  });

  it('rejects an inactive code', () => {
    expect(validateCode(code({ status: 'inactive' }), ctx())).toEqual({
      valid: false,
      reason: 'inactive',
    });
  });

  it('rejects an expired code', () => {
    expect(
      validateCode(code({ expiresAt: '2026-08-01T00:00:00.000Z' }), ctx()),
    ).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects a code that has not started', () => {
    expect(
      validateCode(code({ startsAt: '2026-09-01T00:00:00.000Z' }), ctx()),
    ).toEqual({ valid: false, reason: 'not_started' });
  });

  it('rejects a code that hit its use limit', () => {
    expect(validateCode(code({ maxUses: 50, useCount: 50 }), ctx())).toEqual({
      valid: false,
      reason: 'exhausted',
    });
  });

  it('blocks self-referral (§85)', () => {
    expect(validateCode(code(), ctx({ redeemingUserId: 'user-arthur' }))).toEqual({
      valid: false,
      reason: 'self_referral',
    });
  });

  it('allows only one attribution per account (§85)', () => {
    expect(validateCode(code(), ctx({ hasExistingAttribution: true }))).toEqual({
      valid: false,
      reason: 'already_attributed',
    });
  });
});

describe('buildReferralCode', () => {
  it('builds a readable code from the first name', () => {
    expect(buildReferralCode('Arthur', '26')).toBe('ARTHUR26');
  });

  it('strips accents and non-letters', () => {
    expect(buildReferralCode('José Antônio', 'X7')).toBe('JOSEX7');
  });

  it('falls back for names too short to be a code', () => {
    expect(buildReferralCode('Jo', '4B')).toBe('DRIVER4B');
  });

  it('generates suffixes without ambiguous characters', () => {
    const suffix = generateCodeSuffix(6, (() => {
      let i = 0;
      const seq = [0, 0.2, 0.4, 0.6, 0.8, 0.99];
      return () => seq[i++ % seq.length]!;
    })());
    expect(suffix).toHaveLength(6);
    expect(suffix).not.toMatch(/[01IO]/);
  });

  it('normalises user input', () => {
    expect(normaliseCode('  arthur 26 ')).toBe('ARTHUR26');
  });
});

describe('redeemBenefit', () => {
  it('applies R$ 10 to a larger charge', () => {
    const result = redeemBenefit({ benefit: benefit(), amountDue: 2_990, now: NOW });
    expect(result.applied).toBe(true);
    expect(result.charged).toBe(1_990);
    expect(result.discountUsed).toBe(1_000);
    expect(result.nextStatus).toBe('used');
  });

  it('never produces a negative charge (§84)', () => {
    const result = redeemBenefit({ benefit: benefit(), amountDue: 600, now: NOW });
    expect(result.charged).toBe(0);
    expect(result.discountUsed).toBe(600);
    expect(result.nextStatus).toBe('used');
  });

  it('keeps the remainder when the commercial rule says so', () => {
    const result = redeemBenefit({
      benefit: benefit(),
      amountDue: 600,
      now: NOW,
      remainderPolicy: 'keep_remainder',
    });
    expect(result.charged).toBe(0);
    expect(result.discountRemaining).toBe(400);
    expect(result.nextStatus).toBe('granted');
  });

  it('can only be used once (§85)', () => {
    const used = benefit({ status: 'used', usedAt: '2026-08-01T00:00:00.000Z' });
    expect(isBenefitRedeemable(used, NOW)).toBe(false);

    const result = redeemBenefit({ benefit: used, amountDue: 2_990, now: NOW });
    expect(result.applied).toBe(false);
    expect(result.charged).toBe(2_990);
    expect(result.discountUsed).toBe(0);
  });

  it('refuses an expired benefit', () => {
    const expired = benefit({ expiresAt: '2026-08-01T00:00:00.000Z' });
    expect(isBenefitRedeemable(expired, NOW)).toBe(false);
    expect(redeemBenefit({ benefit: expired, amountDue: 2_990, now: NOW }).applied).toBe(false);
  });
});

describe('evaluateReferralEligibility', () => {
  const base = {
    referrerUserId: 'user-arthur',
    referredUserId: 'user-new',
    referrerIsBlocked: false,
    referredHasAttribution: false,
  };

  it('accepts a clean referral', () => {
    expect(evaluateReferralEligibility(base)).toEqual({ eligible: true });
  });

  it('rejects self-referral', () => {
    expect(evaluateReferralEligibility({ ...base, referredUserId: 'user-arthur' })).toEqual({
      eligible: false,
      reason: 'self_referral',
    });
  });

  it('rejects a second attribution', () => {
    expect(evaluateReferralEligibility({ ...base, referredHasAttribution: true })).toEqual({
      eligible: false,
      reason: 'already_attributed',
    });
  });

  it('rejects a blocked referrer', () => {
    expect(evaluateReferralEligibility({ ...base, referrerIsBlocked: true })).toEqual({
      eligible: false,
      reason: 'referrer_blocked',
    });
  });

  it('rejects an unknown referrer', () => {
    expect(evaluateReferralEligibility({ ...base, referrerUserId: null })).toEqual({
      eligible: false,
      reason: 'referrer_not_found',
    });
  });
});
