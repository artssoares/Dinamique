/**
 * Nothing to hold on a device.
 *
 * The OS keeps the shift alive on its own: iOS through the location background
 * mode, Android through the foreground service the capture layer declares. A
 * wake lock there would only keep the screen lit in the driver's pocket.
 *
 * Metro prefers this file over `screenLock.ts` on iOS and Android, so the web
 * one (which reaches for `navigator.wakeLock`) never reaches a native bundle.
 */

export function screenHeld(): boolean {
  return false;
}

export async function holdScreen(): Promise<void> {
  // Deliberately empty. See above.
}

export async function releaseScreen(): Promise<void> {
  // Deliberately empty. See above.
}
