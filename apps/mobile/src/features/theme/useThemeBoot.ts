import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThemePreference } from '@dinamique/types';
import {
  applyDocumentPreference,
  readStoredPreference,
  readStoredPreferenceSync,
  writeStoredPreference,
} from './preference';

export interface ThemeBoot {
  preference: ThemePreference;
  /** Hand this to <ThemeProvider onPreferenceChange>. */
  persist: (next: ThemePreference) => void;
}

/**
 * Decides which theme the app runs in, and when.
 *
 * The rule that matters is precedence over time, and it is what the old code
 * got wrong. It passed `profile?.theme ?? 'system'` straight into the theme
 * provider, so the app opened on 'system', flipped when the profile arrived,
 * and flipped back whenever the profile was reloaded and the freshly chosen
 * preference had not been saved to it yet. Three switches for one decision.
 *
 * Here the device's stored choice starts the app, the profile is adopted once
 * per person when it arrives, and anything the person picks afterwards wins
 * outright and is written back to the device immediately.
 */
export function useThemeBoot(
  profileId: string | null,
  profileTheme: ThemePreference | null,
): ThemeBoot {
  const [preference, setPreference] = useState<ThemePreference | null>(() =>
    readStoredPreferenceSync(),
  );
  const adoptedFor = useRef<string | null>(null);

  // Devices have no synchronous store, so the value arrives a tick later. It
  // must not overwrite a choice the person has already made in the meantime.
  useEffect(() => {
    let active = true;
    void readStoredPreference().then((stored) => {
      if (active && stored) setPreference((current) => current ?? stored);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profileId || !profileTheme) return;
    if (adoptedFor.current === profileId) return;
    adoptedFor.current = profileId;
    setPreference(profileTheme);
    applyDocumentPreference(profileTheme);
    void writeStoredPreference(profileTheme);
  }, [profileId, profileTheme]);

  const persist = useCallback((next: ThemePreference) => {
    setPreference(next);
    applyDocumentPreference(next);
    void writeStoredPreference(next);
  }, []);

  return { preference: preference ?? 'system', persist };
}
