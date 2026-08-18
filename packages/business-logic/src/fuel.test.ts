import { describe, expect, it } from 'vitest';
import { completeFuelEntry, isFuelEntryComplete } from './fuel';

describe('completeFuelEntry', () => {
  it('calcula os litros a partir do total e do preço', () => {
    // R$ 180,00 a R$ 5,89/l → 30,56 l
    const result = completeFuelEntry({
      totalAmount: 18000,
      pricePerLitre: 589,
      volume: null,
    });
    expect(result.volume).toBe(30560);
    expect(result.derived).toBe('volume');
  });

  it('calcula o preço por litro a partir do total e dos litros', () => {
    const result = completeFuelEntry({
      totalAmount: 18000,
      pricePerLitre: null,
      volume: 30000,
    });
    expect(result.pricePerLitre).toBe(600);
    expect(result.derived).toBe('pricePerLitre');
  });

  it('calcula o total a partir do preço e dos litros', () => {
    const result = completeFuelEntry({
      totalAmount: null,
      pricePerLitre: 589,
      volume: 30000,
    });
    expect(result.totalAmount).toBe(17670);
    expect(result.derived).toBe('totalAmount');
  });

  it('não mexe em nada quando o usuário informou os três', () => {
    const entry = { totalAmount: 18000, pricePerLitre: 589, volume: 29000 };
    const result = completeFuelEntry(entry);
    expect(result.volume).toBe(29000);
    expect(result.derived).toBeNull();
  });

  it('não inventa nada com um campo só', () => {
    const result = completeFuelEntry({ totalAmount: 18000, pricePerLitre: null, volume: null });
    expect(result.volume).toBeNull();
    expect(result.pricePerLitre).toBeNull();
    expect(result.derived).toBeNull();
  });

  it('ignora zeros em vez de dividir por zero', () => {
    const result = completeFuelEntry({ totalAmount: 18000, pricePerLitre: 0, volume: null });
    expect(result.derived).toBeNull();
  });
});

describe('isFuelEntryComplete', () => {
  it('exige um valor gasto', () => {
    expect(isFuelEntryComplete({ totalAmount: 18000, pricePerLitre: null, volume: null })).toBe(true);
    expect(isFuelEntryComplete({ totalAmount: null, pricePerLitre: 589, volume: 30000 })).toBe(false);
    expect(isFuelEntryComplete({ totalAmount: 0, pricePerLitre: null, volume: null })).toBe(false);
  });
});
