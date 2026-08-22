import { describe, expect, it } from 'vitest';
import { parseDecimal } from './decimal';
import { parseKmToMetres } from './units';

describe('parseDecimal', () => {
  it('reads the comma a pt-BR keyboard offers', () => {
    // The reason this exists: Number('34,2') is NaN, and a driver typing the
    // separator their own phone gave them would lose the value.
    expect(parseDecimal('34,2')).toBe(34.2);
  });

  it('reads a dot too', () => {
    expect(parseDecimal('34.2')).toBe(34.2);
  });

  it('treats the last separator as the decimal point', () => {
    expect(parseDecimal('1.234,5')).toBe(1234.5);
    expect(parseDecimal('1,234.5')).toBe(1234.5);
  });

  it('strips grouping when there is no separator at all', () => {
    expect(parseDecimal('1234')).toBe(1234);
  });

  it('reads a lone separator as the decimal point, not as grouping', () => {
    // "1.234" is genuinely ambiguous, and this is the rule `parseCents` has
    // always applied to money: the last separator is the decimal point.
    expect(parseDecimal('1.234')).toBeCloseTo(1.234, 6);
  });

  it('ignores units and currency the driver typed along', () => {
    expect(parseDecimal('34,2 km')).toBe(34.2);
    expect(parseDecimal('R$ 1.500,00')).toBe(1500);
  });

  it('reads a negative', () => {
    expect(parseDecimal('-12,5')).toBe(-12.5);
  });

  it('has nothing to read in an empty or meaningless field', () => {
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('   ')).toBeNull();
    expect(parseDecimal('km')).toBeNull();
    expect(parseDecimal('-')).toBeNull();
  });
});

describe('parseKmToMetres', () => {
  it('stores kilometres as whole metres', () => {
    expect(parseKmToMetres('34,2')).toBe(34_200);
    expect(parseKmToMetres('34.2')).toBe(34_200);
  });

  it('rounds to the metre', () => {
    expect(parseKmToMetres('1,2345')).toBe(1_235);
  });

  it('refuses a value that rounds away to nothing', () => {
    // Under half a metre is not a journey; storing 0 would trip the check
    // constraint and lose the whole close.
    expect(parseKmToMetres('0,0004')).toBeNull();
  });

  it('refuses a zero or a negative — that is a typo, not a shorter day', () => {
    expect(parseKmToMetres('0')).toBeNull();
    expect(parseKmToMetres('-5')).toBeNull();
  });

  it('has nothing to store from an empty field', () => {
    expect(parseKmToMetres('')).toBeNull();
  });
});
