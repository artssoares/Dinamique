import { describe, expect, it } from 'vitest';
import { costRows, revenueRows, totalsFor } from './sales';
import type { Product } from './useProducts';

const agua: Product = { id: 'p1', name: 'Água', unitPrice: 500, unitCost: 150, sortOrder: 0 };
const perfume: Product = { id: 'p2', name: 'Perfume', unitPrice: 5000, unitCost: 2000, sortOrder: 1 };
const bala: Product = { id: 'p3', name: 'Bala', unitPrice: 200, unitCost: null, sortOrder: 2 };

describe('totalsFor', () => {
  it('soma cada produto pela quantidade dele, não pelo último preço', () => {
    const totals = totalsFor([
      { product: agua, quantity: 3 },
      { product: perfume, quantity: 2 },
    ]);
    expect(totals.gross).toBe(500 * 3 + 5000 * 2);
    expect(totals.units).toBe(5);
  });

  it('desconta o que a mercadoria custou, que é o que sobra de verdade', () => {
    const totals = totalsFor([{ product: perfume, quantity: 2 }]);
    expect(totals.gross).toBe(10000);
    expect(totals.cost).toBe(4000);
    expect(totals.profit).toBe(6000);
    expect(totals.hasCost).toBe(true);
  });

  // Sem custo informado, "lucro" seria o faturamento com outro nome. O app
  // prefere não afirmar nada a afirmar um número lisonjeiro.
  it('não finge saber a margem de um produto sem custo', () => {
    const totals = totalsFor([{ product: bala, quantity: 4 }]);
    expect(totals.gross).toBe(800);
    expect(totals.cost).toBe(0);
    expect(totals.hasCost).toBe(false);
  });

  it('conta o custo só dos produtos que têm custo', () => {
    const totals = totalsFor([
      { product: agua, quantity: 2 },
      { product: bala, quantity: 5 },
    ]);
    expect(totals.gross).toBe(1000 + 1000);
    expect(totals.cost).toBe(300);
    expect(totals.hasCost).toBe(true);
  });

  it('ignora as linhas em que ninguém vendeu nada', () => {
    const totals = totalsFor([
      { product: agua, quantity: 0 },
      { product: perfume, quantity: 0 },
    ]);
    expect(totals).toMatchObject({ gross: 0, cost: 0, profit: 0, units: 0, hasCost: false });
  });
});

describe('revenueRows', () => {
  const base = { userId: 'u1', journeyId: 'j1', date: '2026-08-21' };

  it('grava uma linha por produto, com a quantidade', () => {
    const rows = revenueRows({
      ...base,
      lines: [
        { product: agua, quantity: 3 },
        { product: perfume, quantity: 1 },
        { product: bala, quantity: 0 },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ product_id: 'p1', quantity: 3, amount: 1500 });
    expect(rows[1]).toMatchObject({ product_id: 'p2', quantity: 1, amount: 5000 });
  });

  // O banco recusa uma linha que diz ser corrida e venda ao mesmo tempo, e
  // recusaria a gravação inteira junto.
  it('nunca marca um aplicativo numa venda', () => {
    const rows = revenueRows({ ...base, lines: [{ product: agua, quantity: 1 }] });
    expect(rows[0]!.platform_id).toBeNull();
  });
});

describe('costRows', () => {
  const base = { userId: 'u1', journeyId: null, date: '2026-08-21', categoryId: 'cat' };

  it('lança o custo da mercadoria vendida', () => {
    const rows = costRows({ ...base, lines: [{ product: perfume, quantity: 2 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 4000, category_id: 'cat' });
  });

  it('não inventa custo para produto sem custo', () => {
    expect(costRows({ ...base, lines: [{ product: bala, quantity: 9 }] })).toHaveLength(0);
  });

  // Sem a categoria não há onde lançar. Gravar sem ela derrubaria a inserção
  // inteira, levando junto as receitas.
  it('não grava nada quando a categoria não chegou', () => {
    expect(
      costRows({ ...base, categoryId: null, lines: [{ product: perfume, quantity: 2 }] }),
    ).toHaveLength(0);
  });
});
