import { appendFixes, beginRoute, clearDeliberateStop, markDeliberateStop } from './buffer';
import { toFix } from './fix';
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
 */

let watchId: number | null = null;
let currentJourneyId: string | null = null;

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
  },

  async stop() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    currentJourneyId = null;
    await markDeliberateStop();
  },
};
