import { describe, expect, it } from 'vitest';
import { uniformRows } from './closeRows';

describe('uniformRows', () => {
  it('gives every row the union of the keys', () => {
    const rows = uniformRows('revenues', [
      { user_id: 'u', amount: 5000, trip_count: 3 },
      { user_id: 'u', amount: 6000, product_id: 'p', quantity: 1, tips: 0 },
    ]);

    const keys = rows.map((row) => Object.keys(row).sort());
    expect(keys[0]).toEqual(keys[1]);
    expect(keys[0]).toEqual(
      ['amount', 'product_id', 'quantity', 'tips', 'trip_count', 'user_id'].sort(),
    );
  });

  it('fills a missing tips with zero, never null', () => {
    // The regression: `revenues.tips` is `not null default 0`, and a fare row
    // sent alongside a sale row used to arrive with a null in it, which
    // rejected the whole close.
    const [fare] = uniformRows('revenues', [
      { user_id: 'u', amount: 5000 },
      { user_id: 'u', amount: 6000, tips: 500 },
    ]);

    expect(fare!.tips).toBe(0);
  });

  it('fills every other missing column with null', () => {
    const [fare] = uniformRows('revenues', [
      { amount: 5000 },
      { amount: 6000, product_id: 'p' },
    ]);

    expect(fare!.product_id).toBeNull();
  });

  it('never rewrites a value a row already carries', () => {
    const [row] = uniformRows('revenues', [
      { amount: 5000, tips: 250, trip_count: null },
      { amount: 6000, tips: 0 },
    ]);

    expect(row!.tips).toBe(250);
    expect(row!.trip_count).toBeNull();
  });

  it('leaves a single row alone', () => {
    expect(uniformRows('expenses', [{ amount: 100 }])).toEqual([{ amount: 100 }]);
  });

  it('accepts an empty batch', () => {
    expect(uniformRows('revenues', [])).toEqual([]);
  });
});
