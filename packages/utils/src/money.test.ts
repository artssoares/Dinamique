import { describe, expect, it } from 'vitest';
import { applyDiscount, formatCents, parseCents, roundCents, sumCents } from './money';

describe('parseCents', () => {
  it('parses Brazilian formatting', () => {
    expect(parseCents('1.234,56')).toBe(123_456);
    expect(parseCents('R$ 89,90')).toBe(8_990);
    expect(parseCents('284,70')).toBe(28_470);
  });

  it('parses plain and dot-decimal input', () => {
    expect(parseCents('1234.56')).toBe(123_456);
    expect(parseCents('300')).toBe(30_000);
  });

  it('rejects junk', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('abc')).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats as Brazilian currency', () => {
    expect(formatCents(28_470)).toBe('R$ 284,70');
    expect(formatCents(123_456)).toBe('R$ 1.234,56');
    expect(formatCents(0)).toBe('R$ 0,00');
    expect(formatCents(-4_000)).toBe('-R$ 40,00');
  });

  it('can omit the symbol and force a sign', () => {
    expect(formatCents(500, { withSymbol: false })).toBe('5,00');
    expect(formatCents(500, { signed: true })).toBe('+R$ 5,00');
  });
});

describe('roundCents / sumCents', () => {
  it('rounds half away from zero', () => {
    expect(roundCents(10.5)).toBe(11);
    expect(roundCents(-10.5)).toBe(-11);
    expect(roundCents(Number.NaN)).toBe(0);
  });

  it('sums without float drift', () => {
    expect(sumCents([1_010, 2_020, 3_030])).toBe(6_060);
    expect(sumCents([])).toBe(0);
  });
});

describe('applyDiscount', () => {
  it('never yields a negative charge', () => {
    expect(applyDiscount(600, 1_000)).toEqual({
      charged: 0,
      discountUsed: 600,
      discountRemaining: 400,
    });
  });

  it('applies in full when the charge is larger', () => {
    expect(applyDiscount(2_990, 1_000)).toEqual({
      charged: 1_990,
      discountUsed: 1_000,
      discountRemaining: 0,
    });
  });
});
