import * as Location from 'expo-location';
import { appendFixes, beginRoute, clearDeliberateStop, markDeliberateStop } from './buffer';
import { GPS_DISTANCE_INTERVAL_M, GPS_TIME_INTERVAL_MS } from './constants';
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
 */

let subscription: Location.LocationSubscription | null = null;
let currentJourneyId: string | null = null;

export const locationService: LocationService = {
  supportsBackground: false,

  async isTracking() {
    return subscription !== null;
  },

  async start(journeyId: string) {
    await this.stop();
    await beginRoute(journeyId);
    await clearDeliberateStop();
    currentJourneyId = journeyId;

    subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        distanceInterval: GPS_DISTANCE_INTERVAL_M,
        timeInterval: GPS_TIME_INTERVAL_MS,
      },
      (position) => {
        if (!currentJourneyId) return;
        void appendFixes(currentJourneyId, [toFix(position)]);
      },
    );
  },

  async stop() {
    subscription?.remove();
    subscription = null;
    currentJourneyId = null;
    await markDeliberateStop();
  },
};
