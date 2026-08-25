/**
 * One key set for every row a journey close writes.
 *
 * PostgREST inserts a batch by the *union* of the keys it finds across the
 * array, so a row that simply omits a column is written as `NULL` rather than
 * as its default. That is not a theoretical hazard: `revenues.tips` is
 * `not null default 0`, the fare rows built from the driver's platforms carry
 * no `tips` key and the product rows carry `tips: 0`, so any close holding
 * both an app fare and a sale sent a null into a column that refuses one. The
 * insert was rejected, the close reported "Não conseguimos concluir agora",
 * and the shift stayed open with the day's money still on the phone.
 *
 * Normalising here rather than at each call site is deliberate. The bug is a
 * property of the *batch*, not of either builder, so a rule that lives in one
 * of them is a rule the other one can break again the next time a column is
 * added.
 */

export type CloseTable = 'revenues' | 'expenses';

/**
 * Columns whose blank value is not null, per table.
 *
 * Anything not named here is filled with null, which is what an absent
 * optional column means. A column that refuses null belongs on this list.
 */
const BLANKS: Record<CloseTable, Record<string, unknown>> = {
  revenues: { tips: 0 },
  expenses: {},
};

/**
 * The same rows, every one of them carrying every key any of them carries.
 *
 * Order is preserved and values are never rewritten: a key a row already has
 * is passed through untouched, including an explicit null.
 */
export function uniformRows(
  table: CloseTable,
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) keys.add(key);
  }

  const blanks = BLANKS[table];

  return rows.map((row) => {
    const full: Record<string, unknown> = {};
    for (const key of keys) {
      full[key] = key in row ? row[key] : (blanks[key] ?? null);
    }
    return full;
  });
}
