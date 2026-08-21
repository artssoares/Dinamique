import { useCallback, useEffect, useState } from 'react';
import type { Cents } from '@dinamique/types';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { toFriendlyError } from '@/lib/errors';
import { useSession } from '@/hooks/useSession';

export interface Product {
  id: string;
  name: string;
  unitPrice: Cents;
  unitCost: Cents | null;
  sortOrder: number;
}

export interface ProductDraft {
  name: string;
  unitPrice: Cents;
  unitCost?: Cents | null;
}

interface ProductRow {
  id: string;
  name: string;
  unit_price: number;
  unit_cost: number | null;
  sort_order: number;
}

function toProduct(row: ProductRow): Product {
  return {
    id: String(row.id),
    name: String(row.name),
    unitPrice: Number(row.unit_price),
    unitCost: row.unit_cost === null ? null : Number(row.unit_cost),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

/**
 * The driver's own catalogue of things they sell in the car.
 *
 * Deliberately small: a name and a price is everything the sale screen needs,
 * and asking for anything more at the moment somebody is trying to write down
 * that they sold two perfumes is how the feature goes unused. The unit cost is
 * there for whoever wants it, and the app says nothing about margin until it
 * has been given one.
 */
export function useProducts() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setProducts([]);
      setLoading(false);
      return;
    }
    const { data, error: readError } = await supabase
      .from('products')
      .select('id, name, unit_price, unit_cost, sort_order')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('sort_order')
      .order('name');

    if (readError) setError(toFriendlyError(readError).message);
    else setProducts(((data as ProductRow[] | null) ?? []).map(toProduct));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (draft: ProductDraft): Promise<boolean> => {
      if (!userId) return false;
      setBusy(true);
      setError(null);
      const { error: writeError } = await supabase.from('products').insert({
        user_id: userId,
        name: draft.name.trim(),
        unit_price: draft.unitPrice,
        unit_cost: draft.unitCost ?? null,
        sort_order: products.length,
      });
      setBusy(false);

      if (writeError) {
        // A unique violation is not a system failure, it is the person adding
        // the same thing twice, and it deserves a sentence they can act on.
        setError(
          isDuplicate(writeError)
            ? `Você já tem "${draft.name.trim()}" na sua lista.`
            : toFriendlyError(writeError).message,
        );
        return false;
      }

      void track('product_created', {});
      await refresh();
      return true;
    },
    [products.length, refresh, userId],
  );

  const update = useCallback(
    async (id: string, patch: Partial<ProductDraft>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      const { error: writeError } = await supabase
        .from('products')
        .update({
          ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
          ...(patch.unitPrice === undefined ? {} : { unit_price: patch.unitPrice }),
          ...(patch.unitCost === undefined ? {} : { unit_cost: patch.unitCost }),
        })
        .eq('id', id);
      setBusy(false);

      if (writeError) {
        setError(toFriendlyError(writeError).message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh],
  );

  /**
   * Archives rather than deletes. The sales already recorded point at this row
   * and must keep their name; a delete would turn last month's history into a
   * list of anonymous amounts.
   */
  const archive = useCallback(
    async (id: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      const { error: writeError } = await supabase
        .from('products')
        .update({ is_active: false })
        .eq('id', id);
      setBusy(false);

      if (writeError) {
        setError(toFriendlyError(writeError).message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh],
  );

  return {
    products,
    loading,
    busy,
    error,
    dismissError: useCallback(() => setError(null), []),
    refresh,
    create,
    update,
    archive,
  };
}

function isDuplicate(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === '23505';
}
