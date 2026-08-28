/**
 * Keeping the browser awake while a shift is being counted.
 *
 * This is the web's version of Android's foreground service, and it exists for
 * the same reason: a browser reports positions only while its page is alive
 * and on screen. Lock the phone, or switch to the navigation app, and
 * `watchPosition` stops firing without an error and without any event we could
 * listen for. The shift keeps happening; the track does not.
 *
 * That is not a hypothetical. Routes recorded in the browser were coming back
 * with a single point for shifts that ran for hours: one reading taken while
 * the driver was still looking at the screen, and nothing after it.
 *
 * A screen wake lock is the only lever a page has here. It is not a promise:
 * the browser drops it whenever the tab is hidden, and refuses it outright on
 * an insecure origin or a browser that never shipped the API. So every path
 * below fails quietly and the capture layer carries on without it.
 *
 * This is the module TypeScript resolves; `screenLock.native.ts` is the device
 * one, where the OS already keeps the shift alive and there is nothing to do.
 */

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockCapableNavigator {
  wakeLock?: { request(type: 'screen'): Promise<Sentinel> };
}

let sentinel: Sentinel | null = null;
/** Serialises the requests, so two starts in a row cannot leak a lock. */
let pending: Promise<void> = Promise.resolve();

function api(): WakeLockCapableNavigator['wakeLock'] | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as WakeLockCapableNavigator).wakeLock;
}

/** True when the screen is being held awake right now. Used by the copy. */
export function screenHeld(): boolean {
  return sentinel !== null && !sentinel.released;
}

/**
 * Asks the browser to keep the screen on. Safe to call when one is already
 * held, and safe to call where the API does not exist.
 */
export function holdScreen(): Promise<void> {
  const next = pending.then(async () => {
    if (screenHeld()) return;
    const wakeLock = api();
    if (!wakeLock) return;

    try {
      const held = await wakeLock.request('screen');
      sentinel = held;
      // The browser releases the lock on its own whenever the tab goes away.
      // Forgetting that means `screenHeld()` lies and the next `holdScreen()`
      // returns early instead of asking for a fresh one.
      held.addEventListener('release', () => {
        if (sentinel === held) sentinel = null;
      });
    } catch {
      // Refused: an insecure origin, a hidden document, a browser without it.
      // Capture still works while the page is on screen, which is what the
      // journey card already tells the driver.
      sentinel = null;
    }
  });

  pending = next.catch(() => undefined);
  return next;
}

export function releaseScreen(): Promise<void> {
  const next = pending.then(async () => {
    const held = sentinel;
    sentinel = null;
    if (!held || held.released) return;
    await held.release().catch(() => undefined);
  });

  pending = next.catch(() => undefined);
  return next;
}
