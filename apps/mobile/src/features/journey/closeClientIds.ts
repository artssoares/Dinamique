import type { UUID } from '@dinamique/types';

/**
 * Stable identifiers for the rows a journey close writes.
 *
 * The close can be retried — a lost connection, a rejected update — and the
 * screen can be remounted between attempts, which loses any in-memory latch.
 * Without something durable the second attempt inserts the same revenues and
 * expenses again and silently doubles the day's takings in the history.
 *
 * Deriving the id from the journey and the row's own subject makes every
 * attempt produce the same value, so the close can delete exactly what it is
 * about to write and never touch anything the driver entered from the Record
 * tab against the same journey.
 *
 * Derived rather than stored because storage is the thing that might not be
 * there: a reinstall, a cleared cache, a different device finishing the same
 * journey all still arrive at the same id.
 */
export function closeRowClientId(
  journeyId: string,
  kind: 'revenue' | 'expense',
  subjectId: string,
): UUID {
  return uuidFromSeed(`dinamique:close:${journeyId}:${kind}:${subjectId}`);
}

/**
 * A deterministic UUID from a string.
 *
 * Four rounds of FNV-1a over salted copies of the seed give 128 bits, laid out
 * in the version-5 shape so the value is a well-formed UUID wherever it lands.
 * It is a naming scheme, not a secret: the only property required is that the
 * same seed always yields the same id, and that different seeds within one
 * driver's journey do not collide.
 */
function uuidFromSeed(seed: string): UUID {
  const words = [0, 1, 2, 3].map((salt) => fnv1a(`${salt}:${seed}`));
  const hex = words.map((word) => word.toString(16).padStart(8, '0')).join('');

  const version = `5${hex.slice(13, 16)}`;
  // Variant bits: 8, 9, a or b in the first position of the fourth group.
  const variant = `${'89ab'[parseInt(hex[16]!, 16) % 4]}${hex.slice(17, 20)}`;

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${version}-${variant}-${hex.slice(20, 32)}`;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}
