import type { Cents } from '@dinamique/types';
import type { Product } from './useProducts';

export interface SaleLine {
  product: Product;
  quantity: number;
}

export interface SaleTotals {
  /** What the passengers paid. */
  gross: Cents;
  /** What the goods cost, counting only the products whose cost is known. */
  cost: Cents;
  /** gross minus cost. Equal to gross when no cost was ever entered. */
  profit: Cents;
  /** True once at least one sold product has a cost, so profit means something. */
  hasCost: boolean;
  units: number;
}

/**
 * What a basket of sales is worth.
 *
 * Kept out of the screens and tested, like every other calculation in the app:
 * quantity times price is trivial until someone sells three of one thing and
 * two of another and the screen shows the price of the last one.
 */
export function totalsFor(lines: SaleLine[]): SaleTotals {
  let gross = 0;
  let cost = 0;
  let units = 0;
  let hasCost = false;

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    gross += line.product.unitPrice * line.quantity;
    units += line.quantity;
    if (line.product.unitCost !== null) {
      cost += line.product.unitCost * line.quantity;
      hasCost = true;
    }
  }

  return { gross, cost, profit: gross - cost, hasCost, units };
}

/** The rows a basket becomes: one revenue per product, never one lump sum. */
export function revenueRows(input: {
  userId: string;
  journeyId: string | null;
  date: string;
  lines: SaleLine[];
}): Record<string, unknown>[] {
  return input.lines
    .filter((line) => line.quantity > 0)
    .map((line) => ({
      user_id: input.userId,
      journey_id: input.journeyId,
      // Never both: the database rejects a row that claims to be a fare and a
      // sale at once, because it would be counted twice in the breakdown.
      platform_id: null,
      product_id: line.product.id,
      quantity: line.quantity,
      date: input.date,
      amount: line.product.unitPrice * line.quantity,
      tips: 0,
    }));
}

/**
 * The expense rows for the goods that were sold, for the products whose cost
 * is known.
 *
 * Without this the app would call a perfume bought for twenty and sold for
 * fifty a fifty real profit, which is the exact kind of flattering arithmetic
 * this app exists to stop. Products are not a vehicle cost, so they never
 * touch cost per kilometre.
 */
export function costRows(input: {
  userId: string;
  journeyId: string | null;
  date: string;
  categoryId: string | null;
  lines: SaleLine[];
}): Record<string, unknown>[] {
  if (!input.categoryId) return [];

  return input.lines
    .filter((line) => line.quantity > 0 && line.product.unitCost !== null)
    .map((line) => ({
      user_id: input.userId,
      journey_id: input.journeyId,
      category_id: input.categoryId,
      date: input.date,
      amount: (line.product.unitCost ?? 0) * line.quantity,
    }))
    .filter((row) => (row.amount as number) > 0);
}
