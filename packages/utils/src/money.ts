import type { Cents } from '@dinamique/types';

/**
 * Money helpers. Everything is integer cents; the only place a float appears
 * is at the formatting boundary and in ratios (which are never money).
 */

/** Round half away from zero — matches how people expect currency to round. */
export function roundCents(value: number): Cents {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Parse user input like "1.234,56", "1234.56", "R$ 89,90" into cents. */
export function parseCents(input: string): Cents | null {
  const cleaned = input.replace(/[^\d,.-]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : lastDot > lastComma ? '.' : null;

  let normalised: string;
  if (decimalSep === null) {
    normalised = cleaned.replace(/[.,]/g, '');
  } else {
    const idx = decimalSep === ',' ? lastComma : lastDot;
    const intPart = cleaned.slice(0, idx).replace(/[.,]/g, '');
    const fracPart = cleaned.slice(idx + 1).replace(/[^\d]/g, '');
    normalised = `${intPart}.${fracPart}`;
  }

  const value = Number(normalised);
  if (!Number.isFinite(value)) return null;
  return roundCents(value * 100);
}

export function formatCents(
  value: Cents,
  options: { withSymbol?: boolean; signed?: boolean } = {},
): string {
  const { withSymbol = true, signed = false } = options;
  const negative = value < 0;
  const abs = Math.abs(value);
  const reais = Math.floor(abs / 100);
  const cents = abs % 100;

  const intStr = reais.toLocaleString('pt-BR');
  const body = `${intStr},${String(cents).padStart(2, '0')}`;

  const sign = negative ? '-' : signed ? '+' : '';
  return withSymbol ? `${sign}R$ ${body}` : `${sign}${body}`;
}

/**
 * Apply a discount without ever producing a negative charge.
 * Returns how much was actually consumed, so the caller can decide what
 * happens to the remainder per the configured commercial rule (§84).
 */
export function applyDiscount(
  amountDue: Cents,
  discount: Cents,
): { charged: Cents; discountUsed: Cents; discountRemaining: Cents } {
  const safeDue = Math.max(0, amountDue);
  const safeDiscount = Math.max(0, discount);
  const discountUsed = Math.min(safeDue, safeDiscount);
  return {
    charged: safeDue - discountUsed,
    discountUsed,
    discountRemaining: safeDiscount - discountUsed,
  };
}
