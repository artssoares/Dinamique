import { appendFixes, beginRoute, clearDeliberateStop, markDeliberateStop } from './buffer';
import { toFix } from './fix';
import { holdScreen, releaseScreen } from './screenLock';
import type { LocationService } from './types';

/**
 * Web capture: foreground only, and honest about it.
 *
 * This is also the module TypeScript resolves for `./locationService`, which is
 * why it is the plain `.ts` and the device version carries the `.native`
 * suffix. Metro prefers the platform file on iOS and Android and falls through
 * to this one for web, so the web bundle never sees expo-task-manager.
 *
 * A browser tab cannot watch a driver's position with the screen off, and
 * pretending otherwise would quietly lose half a shift. The journey card says
 * plainly that the browser only counts with the tab open.
 *
 * `navigator.geolocation` directly, rather than `Location.watchPositionAsync`.
 * That is not a preference — expo-location's web shim is broken for watching.
 * It reassigns the watch id it was handed:
 *
 *     async watchPositionImplAsync(watchId, options) {
 *       watchId = navigator.geolocation.watchPosition((position) => {
 *         LocationEventEmitter.emit('Expo.locationChanged', { watchId, ... });
 *
 * The callback closes over `watchId`, which by the time it fires holds the
 * *browser's* id, not the one expo registered our callback under. The
 * subscriber looks up `callbacks[browserId]`, finds nothing, and — worse —
 * calls `removeWatchAsync` on it, cancelling the watch outright. Every
 * position was dropped and the whole shift came back empty. The two ids happen
 * to agree on a fresh page, which is exactly what makes it survive a casual
 * test and fail on the second journey.
 *
 * Permissions still go through expo-location: only the watching is affected,
 * and its permission shim is a thin, correct wrapper over the Permissions API.
 *
 * Three things beyond the watch itself, all of them about the same problem.
 * A browser only reports positions while its page is awake and on screen:
 *
 *  - a screen wake lock, so a phone in a cradle keeps feeding the watch
 *    instead of going dark thirty seconds in;
 *  - one immediate reading at the start, because `watchPosition` can take a
 *    long time to produce its first fix and a short shift closed before then
 *    had no route at all;
 *  - another reading whenever the tab comes back, so the stretch that was not
 *    recorded ends and the next one starts at a real position rather than
 *    being joined to a place the driver left half an hour ago.
 *
 * Routes recorded in the browser were coming back with one point for shifts
 * that ran for hours. That is what all three are for.
 */

/** How stale a seeded reading may be. Long enough to answer instantly. */
const SEED_MAX_AGE_MS = 15_000;
/** And how long to wait for a fresh one before giving up on the seed. */
const SEED_TIMEOUT_MS = 20_000;

let watchId: number | null = null;
let currentJourneyId: string | null = null;
let onVisibilityChange: (() => void) | null = null;

/**
 * Takes one reading now and buffers it.
 *
 * Optional-called, because `getCurrentPosition` is the one method a stubbed
 * geolocation may not carry, and a missing seed is a slower first point rather
 * than a failure. Errors are ignored for the same reason: the watch is the
 * real source, this only gets it going.
 */
function seedFix(): void {
  const journeyId = currentJourneyId;
  if (journeyId === null) return;

  navigator.geolocation.getCurrentPosition?.(
    (position) => {
      // The journey may have ended, or another one started, while the browser
      // was working on this. Buffering it against the wrong shift would put
      // one journey's position inside another's line.
      if (currentJourneyId !== journeyId) return;
      void appendFixes(journeyId, [toFix(position as never)]);
    },
    () => {
      // No first fix yet. The watch keeps trying.
    },
    { enableHighAccuracy: true, maximumAge: SEED_MAX_AGE_MS, timeout: SEED_TIMEOUT_MS },
  );
}

/**
 * Picks the screen lock and the track back up when the driver returns.
 *
 * The browser drops a wake lock every time the tab is hidden and never
 * restores it, so without this the very first app switch of a shift ends the
 * counting for good.
 */
function watchForReturn(): void {
  if (typeof document === 'undefined' || onVisibilityChange !== null) return;

  onVisibilityChange = () => {
    if (document.visibilityState !== 'visible' || currentJourneyId === null) return;
    void holdScreen();
    seedFix();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
}

function stopWatchingForReturn(): void {
  if (typeof document === 'undefined' || onVisibilityChange === null) return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  onVisibilityChange = null;
}

export const locationService: LocationService = {
  supportsBackground: false,

  async isTracking() {
    return watchId !== null;
  },

  async start(journeyId: string) {
    await this.stop();
    await beginRoute(journeyId);
    await clearDeliberateStop();
    currentJourneyId = journeyId;

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!currentJourneyId) return;
        // A browser `GeolocationPosition` carries the same fields `toFix`
        // reads — `timestamp` and `coords.{latitude,longitude,accuracy,speed}`
        // — under the same names expo's own type declares.
        void appendFixes(currentJourneyId, [toFix(position as never)]);
      },
      () => {
        // A single failure is not the end of the shift: `watchPosition` keeps
        // watching after an error, and a driver passing under a tunnel should
        // not lose the rest of their day. Tearing the watch down here is what
        // the broken shim effectively did.
      },
      {
        // The browser's own key, and the reason it matters: without it the
        // browser positions by wifi and cell — tens to hundreds of metres of
        // error, all of which `MAX_ACCEPTABLE_ACCURACY_M` then rejects. The
        // driver would grant the permission, drive, and be told they had gone
        // nowhere.
        enableHighAccuracy: true,
        // Never a cached fix. A stale position repeated across a shift reads
        // as a driver who never moved.
        maximumAge: 0,
      },
    );

    // Not awaited: the shift starts either way, and a browser that refuses the
    // lock still counts for as long as the page is on screen.
    void holdScreen();
    watchForReturn();
    seedFix();
  },

  async stop() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    currentJourneyId = null;
    stopWatchingForReturn();
    await releaseScreen();
    await markDeliberateStop();
  },
};
