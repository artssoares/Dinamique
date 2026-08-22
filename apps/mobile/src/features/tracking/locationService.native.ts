import * as Location from 'expo-location';
import { beginRoute, clearDeliberateStop, markDeliberateStop } from './buffer';
import {
  FOREGROUND_SERVICE_NOTIFICATION,
  GPS_DEFERRED_DISTANCE_M,
  GPS_DEFERRED_INTERVAL_MS,
  GPS_DISTANCE_INTERVAL_M,
  GPS_TIME_INTERVAL_MS,
  LOCATION_TASK,
} from './constants';
import type { LocationService } from './types';

/**
 * Device capture: the OS keeps feeding the task even with the app closed.
 *
 * On the accuracy choice — `Balanced` is roughly a hundred-metre class fix,
 * which is fine for "which neighbourhood" and useless for summing a distance;
 * the error would swamp the movement between readings. `High` at a 25 m / 10 s
 * cadence is what makes the total mean anything, and deferred updates claw back
 * most of the battery by letting iOS batch instead of waking us each time.
 *
 * `pausesUpdatesAutomatically` is off deliberately. iOS will otherwise decide a
 * long red light means the trip ended and quietly stop — and it does not
 * reliably start again, so the driver loses the rest of the shift.
 */
export const locationService: LocationService = {
  supportsBackground: true,

  async isTracking() {
    return Location.hasStartedLocationUpdatesAsync(LOCATION_TASK);
  },

  async start(journeyId: string) {
    await this.stop();
    await beginRoute(journeyId);
    await clearDeliberateStop();

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      activityType: Location.ActivityType.AutomotiveNavigation,
      distanceInterval: GPS_DISTANCE_INTERVAL_M,
      timeInterval: GPS_TIME_INTERVAL_MS,
      deferredUpdatesDistance: GPS_DEFERRED_DISTANCE_M,
      deferredUpdatesInterval: GPS_DEFERRED_INTERVAL_MS,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      // Android will not deliver background location without a visible service.
      // That is the right trade: the driver can see we are counting.
      foregroundService: {
        ...FOREGROUND_SERVICE_NOTIFICATION,
        killServiceOnDestroy: false,
      },
    });
  },

  async stop() {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
    // Noted so the recovery path does not read our own stop as a device
    // restart and tell the driver kilometres may be missing.
    await markDeliberateStop();
  },
};
