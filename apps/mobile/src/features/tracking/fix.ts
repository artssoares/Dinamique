import type { LocationObject } from 'expo-location';
import type { Fix } from '@dinamique/business-logic';

/** Stands in for "the device did not say". Far past any usable threshold. */
export const UNKNOWN_ACCURACY_M = 100_000;

/**
 * One shape for a reading, whichever platform produced it.
 *
 * Platform-neutral on purpose. Living in `locationService.ts` — the *web*
 * implementation — would mean the background task's import of it resolved to
 * the native service on device, where it does not exist, and every batch of
 * locations would throw before anything was buffered. tsc cannot see that,
 * because tsc resolves the bare web file.
 */
export function toFix(position: LocationObject): Fix {
  return {
    t: position.timestamp,
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    // A device that will not say how sure it is gets treated as unsure — with
    // a finite sentinel, because Infinity serialises to null and the fix would
    // then come back from storage looking perfectly accurate.
    acc: position.coords.accuracy ?? UNKNOWN_ACCURACY_M,
    spd: position.coords.speed ?? null,
  };
}
