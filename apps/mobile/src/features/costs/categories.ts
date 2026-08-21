import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Maps the `expense_categories` slugs a screen needs to the ids the table
 * wants.
 *
 * Screens speak in slugs because a slug is stable and readable in the source;
 * the table speaks in uuids. Without this every screen would either hard-code
 * an id, which breaks on a fresh install, or fetch the whole category list to
 * find one row.
 */
export function useCostCategories(slugs: readonly string[]): Record<string, string> {
  const [bySlug, setBySlug] = useState<Record<string, string>>({});
  // Joined, so the effect keys on the contents rather than on the identity of
  // an array that is rebuilt on every render.
  const key = slugs.join(',');

  useEffect(() => {
    void supabase
      .from('expense_categories')
      .select('id, slug')
      .in('slug', key.split(','))
      .then(({ data }) => {
        const rows = (data as { id: string; slug: string }[] | null) ?? [];
        setBySlug(Object.fromEntries(rows.map((row) => [row.slug, row.id])));
      });
  }, [key]);

  return bySlug;
}
