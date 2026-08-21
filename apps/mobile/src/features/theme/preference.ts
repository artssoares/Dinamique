import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ThemePreference } from '@dinamique/types';

/**
 * Where the chosen theme is remembered on this device.
 *
 * The name is shared with the document shell in `app/+html.tsx`, which reads
 * the same key from `localStorage` before a single line of the application has
 * run. Change it in one place and the first paint goes back to guessing.
 *
 * AsyncStorage on the web is `localStorage` with the key and value untouched,
 * so the two agree without any translation.
 */
export const THEME_STORAGE_KEY = 'dinamique.theme';

const VALID: ThemePreference[] = ['light', 'dark', 'system'];

function parse(value: string | null | undefined): ThemePreference | null {
  return VALID.includes(value as ThemePreference) ? (value as ThemePreference) : null;
}

/**
 * The stored choice, read without waiting.
 *
 * Reading it asynchronously would still cost a frame on the wrong theme, and a
 * frame is exactly what the person sees as a flash. On the web the value is
 * already in memory, so there is no reason to await it; on the devices there
 * is no synchronous store and the async read below takes over.
 */
export function readStoredPreferenceSync(): ThemePreference | null {
  if (Platform.OS !== 'web') return null;
  try {
    return parse(globalThis.localStorage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * The theme the app should open with, before anything is known about who is
 * signing in.
 *
 * Without this the app opened on 'system', then switched once the profile
 * loaded: light, dark, light, on every cold start. The preference belongs to
 * the person, and the person is the same one who closed the app last time.
 */
export async function readStoredPreference(): Promise<ThemePreference | null> {
  try {
    return parse(await AsyncStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Storage can be unavailable (a private window, a wiped profile). Falling
    // back to the OS is correct; failing to start is not.
    return null;
  }
}

export async function writeStoredPreference(preference: ThemePreference): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Nothing to do: the app still works, it just flashes once next time.
  }
}

/**
 * Keeps the document element in step with the app on the web, so the parts the
 * browser paints itself – the overscroll gutter, the scrollbar, the area
 * behind a rubber-banding page – match the theme instead of staying white.
 */
export function applyDocumentPreference(preference: ThemePreference): void {
  if (Platform.OS !== 'web') return;
  const root = globalThis.document?.documentElement;
  if (!root) return;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

/**
 * Reveals the page once the application has rendered in the right theme.
 *
 * The document keeps `#root` hidden until this runs (see `app/+html.tsx`),
 * because the pre-rendered markup is always light: without it, opening on the
 * dark theme means half a second of a white screen first.
 */
export function markDocumentReady(): void {
  if (Platform.OS !== 'web') return;
  globalThis.document?.documentElement?.setAttribute('data-ready', '');
}
