import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Phones stay upright; tablets turn.
 *
 * The app used to be locked to portrait in `app.json`, for every device. On a
 * phone that is right: the driver holds it in one hand or it sits in a vent
 * mount, and a screen that spins every time the car takes a corner is a
 * hazard. On a tablet it is wrong: most of them ride in a dashboard mount
 * lying down, and the app came up sideways or not at all. (Android 16 already
 * ignores a portrait lock on large screens for apps that target it, so on
 * Android tablets the layout had to work sideways regardless.)
 *
 * So `app.json` now allows every orientation and the lock is applied here, at
 * runtime, only where the device says it is a phone. Anything it cannot
 * classify keeps the free rotation: wrongly locking a tablet sideways would be
 * worse than letting an unusual phone turn.
 */
export function lockPhonePortrait(): void {
  // The browser decides its own orientation; there is nothing to lock.
  if (Platform.OS === 'web') return;
  if (Device.deviceType !== Device.DeviceType.PHONE) return;

  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {
    // A device that refuses the lock simply rotates, which is what a tablet
    // does anyway. Not worth surfacing to the driver.
  });
}
