/**
 * Shared primitive aliases.
 *
 * Money is ALWAYS stored and computed in integer cents (BRL). Floating point
 * currency is a defect class we refuse to ship – see PRODUCT_RULES.md §Money.
 */
export type UUID = string;

/** Integer amount in cents (centavos). 1000 === R$ 10,00 */
export type Cents = number;

/** ISO-8601 date-only string, `YYYY-MM-DD`, in the user's local calendar. */
export type DateOnly = string;

/** ISO-8601 instant with timezone, e.g. `2026-08-18T14:32:00.000Z`. */
export type Timestamp = string;

/** Distance in whole metres. Avoids float km drift; 1 km === 1000. */
export type Metres = number;

/** Duration in whole seconds. */
export type Seconds = number;

/** Volume in millilitres. 1 L === 1000. */
export type Millilitres = number;

export type Nullable<T> = T | null;
