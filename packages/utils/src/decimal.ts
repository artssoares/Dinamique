/**
 * Reading a number the way a Brazilian driver typed it.
 *
 * A phone keyboard in pt-BR offers a comma for the decimal point, and people
 * write "1.234,5" as readily as "1234,5". `Number()` returns NaN for both. Any
 * field that takes a decimal has to go through here, or a driver who types the
 * separator their keyboard gave them silently loses the value.
 *
 * The separator is decided by whichever of `,` and `.` comes last: in
 * "1.234,5" the comma is the decimal point and the dot is a grouping mark; in
 * "1,234.5" it is the other way round. Everything before it is grouping and
 * gets stripped. A lone separator is read as a decimal point — the rule
 * `parseCents` has always applied to money.
 */
export function parseDecimal(input: string): number | null {
  const cleaned = input.replace(/[^\d,.-]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;

  const separatorIndex = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));

  const normalised =
    separatorIndex === -1
      ? cleaned.replace(/[.,]/g, '')
      : `${cleaned.slice(0, separatorIndex).replace(/[.,]/g, '')}.${cleaned
          .slice(separatorIndex + 1)
          .replace(/[^\d]/g, '')}`;

  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}
