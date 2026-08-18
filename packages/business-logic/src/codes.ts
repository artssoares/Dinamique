import type { Cents, CodeKind, CodeStatus, Timestamp, UUID } from '@dinamique/types';

/**
 * One code engine for referral / influencer / campaign / partnership /
 * promotion (§88). Validation is a single pure function so the app, the Edge
 * Function and the admin panel cannot disagree about whether a code works.
 */

export interface CodeRecord {
  id: UUID;
  code: string;
  kind: CodeKind;
  ownerUserId: UUID | null;
  benefitAmount: Cents;
  startsAt: Timestamp | null;
  expiresAt: Timestamp | null;
  maxUses: number | null;
  useCount: number;
  status: CodeStatus;
}

export type CodeRejectionReason =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'exhausted'
  | 'self_referral'
  | 'already_attributed';

export interface CodeValidationContext {
  /** The account trying to redeem. Null for a pre-signup preview check. */
  redeemingUserId: UUID | null;
  /** True when this account already has an attribution row (§85). */
  hasExistingAttribution: boolean;
  now: Timestamp;
}

export type CodeValidation =
  | { valid: true; code: CodeRecord; benefitAmount: Cents }
  | { valid: false; reason: CodeRejectionReason };

export function validateCode(
  code: CodeRecord | null,
  context: CodeValidationContext,
): CodeValidation {
  if (!code) return { valid: false, reason: 'not_found' };
  if (code.status !== 'active') {
    return { valid: false, reason: code.status === 'expired' ? 'expired' : code.status === 'exhausted' ? 'exhausted' : 'inactive' };
  }

  const now = Date.parse(context.now);
  if (code.startsAt && Date.parse(code.startsAt) > now) {
    return { valid: false, reason: 'not_started' };
  }
  if (code.expiresAt && Date.parse(code.expiresAt) <= now) {
    return { valid: false, reason: 'expired' };
  }
  if (code.maxUses !== null && code.useCount >= code.maxUses) {
    return { valid: false, reason: 'exhausted' };
  }

  // Antifraude V1 (§85): no self-referral, one origin per account.
  if (
    context.redeemingUserId !== null &&
    code.ownerUserId !== null &&
    code.ownerUserId === context.redeemingUserId
  ) {
    return { valid: false, reason: 'self_referral' };
  }
  if (context.hasExistingAttribution) {
    return { valid: false, reason: 'already_attributed' };
  }

  return { valid: true, code, benefitAmount: code.benefitAmount };
}

export const CODE_REJECTION_MESSAGES: Record<CodeRejectionReason, string> = {
  not_found: 'Não encontramos esse código.',
  inactive: 'Esse código não está mais ativo.',
  not_started: 'Esse código ainda não está valendo.',
  expired: 'Esse código expirou.',
  exhausted: 'Esse código já atingiu o limite de usos.',
  self_referral: 'Você não pode usar o seu próprio código.',
  already_attributed: 'Sua conta já usou um código de indicação.',
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Referral codes read like `ARTHUR26`: the owner's first name plus digits.
 * Ambiguous characters (0/O, 1/I) are excluded so codes survive being read
 * aloud or typed from a screenshot.
 */
export function buildReferralCode(firstName: string, suffix: string): string {
  const base = (firstName.trim().split(/\s+/)[0] ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 8);
  const safeBase = base.length >= 3 ? base : 'DRIVER';
  return `${safeBase}${suffix}`;
}

/** Deterministic given `random`, which keeps it testable. */
export function generateCodeSuffix(length = 2, random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)] ?? 'X';
  }
  return out;
}

export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}
