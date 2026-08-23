import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { track } from '@/lib/analytics';
import { useActiveJourney } from '@/features/journey/useJourney';
import { runningJourneyId } from '@/features/journey/runningJourneyId';
import { BackgroundConsentSheet, RouteConsentSheet } from './RouteConsentSheet';
import { locationService } from './locationService';
import { PERMISSION_COPY } from './permission';
import { useRoutePreferences } from './preferences';
import { useJourneyTracking, type JourneyTracking } from './useJourneyTracking';

export interface JourneyStart {
  /** Starts the journey and, when wanted, the counting. */
  begin: () => Promise<void>;
  /** Pausing stops the clock and the counting together. */
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  tracking: JourneyTracking;
  /** The two consent sheets. Render this once, anywhere in the screen. */
  sheets: ReactNode;
}

/**
 * Starting a journey, wherever the driver taps it.
 *
 * This exists as a hook because there are two "Iniciar jornada" buttons — one
 * on Hoje, one on Registrar — and the first version of this feature wired only
 * the second. Someone starting their day from the home screen got no consent
 * sheet, no permission prompt and no kilometres, with nothing on screen to
 * suggest anything was missing. One implementation, used by both, is the only
 * shape that cannot drift back into that.
 *
 * The order is the important part: the journey always starts first, and every
 * GPS step is layered on after. Each of them can fail without costing the
 * driver their shift.
 */
export function useJourneyStart({ recover = true }: { recover?: boolean } = {}): JourneyStart {
  const { journey, start, pause, resume } = useActiveJourney();
  const { read: readRoutePreferences, update: updateRoutePreferences } = useRoutePreferences();
  const tracking = useJourneyTracking(journey?.id ?? null, { recover });
  const [askingConsent, setAskingConsent] = useState(false);
  const [askingBackground, setAskingBackground] = useState(false);
  // Held in a ref because the consent sheet resolves after `journey` has been
  // re-read, and the sheet's callbacks close over the render that opened it.
  const journeyIdRef = useRef<string | null>(null);

  const attachTracking = useCallback(
    async (journeyId: string) => {
      const outcome = await tracking.begin(journeyId);
      if (!outcome.granted) {
        // The preference was written before the OS dialog, so a refusal has to
        // take it back — a switch reading "on" while nothing is recorded is a
        // lie the driver only discovers at the end of the day.
        //
        // Except when the phone's location is simply switched off. That is not
        // a refusal, and clearing the opt-in there would cost a driver the
        // feature permanently over a toggle in the system settings.
        if (outcome.deniedAt !== 'services_off') {
          await updateRoutePreferences({ captureEnabled: false });
        }
        Alert.alert(
          outcome.deniedAt === 'services_off'
            ? 'Localização desligada'
            : 'Sem acesso à localização',
          outcome.deniedAt === 'services_off'
            ? PERMISSION_COPY.servicesOff
            : 'Sem essa permissão o Dinamique não consegue contar seus km. Você pode liberar depois em Mais › Trajeto e privacidade.',
        );
        return;
      }
      // Only now, with the journey visibly running, is "Sempre" a question the
      // driver can actually evaluate — and the one App Store review expects.
      // Asked only if we do not already hold it: re-asking someone who said
      // yes last month is nagging, not consent.
      if (locationService.supportsBackground && !outcome.background) {
        setAskingBackground(true);
      }
    },
    [tracking, updateRoutePreferences],
  );

  const begin = useCallback(async () => {
    if (!(await start(null))) return;
    // Read back rather than trusting the provider's state: `start()` awaits
    // its own refresh, but this closure was rendered before either happened.
    const id = await runningJourneyId();
    if (!id) return;
    journeyIdRef.current = id;

    // Read from the database, not from state. On a cold start the hook is
    // still loading, and its defaults say "capture off" — which would show the
    // consent sheet to someone who opted in months ago, and leave them without
    // capture if they tapped "agora não".
    const preferences = await readRoutePreferences();
    // Could not tell. Starting capture the driver may not have asked for is
    // the worse mistake, so we do not — but we say so, because neither
    // recovery path can fix this later: both need an active-route key that
    // only starting capture creates.
    if (!preferences) {
      Alert.alert(
        'Não conseguimos verificar sua preferência',
        'Sua jornada começou normalmente, mas os km não estão sendo contados pelo GPS. Ligue de novo em Mais › Trajeto e privacidade.',
      );
      return;
    }

    if (preferences.captureEnabled) {
      await attachTracking(id);
      return;
    }
    // Asked once. Someone who said no changes their mind in the settings, not
    // by being asked again at the start of every shift.
    if (!preferences.prompted) setAskingConsent(true);
  }, [attachTracking, readRoutePreferences, start]);

  const declineCapture = useCallback(async () => {
    setAskingConsent(false);
    await updateRoutePreferences({ prompted: true });
  }, [updateRoutePreferences]);

  const acceptCapture = useCallback(async () => {
    setAskingConsent(false);
    // Capture only starts if the consent actually reached the server. Starting
    // anyway would record a whole shift against a preference that still reads
    // `false` — and at close that same `false` drops the distance, drops the
    // route, and releases the buffer.
    const saved = await updateRoutePreferences({ captureEnabled: true, prompted: true });
    if (!saved) {
      Alert.alert(
        'Não conseguimos salvar sua escolha',
        'Confira sua conexão e ligue a contagem por GPS em Mais › Trajeto e privacidade.',
      );
      return;
    }
    void track('route_capture_enabled', { source: 'journey_start' });
    if (journeyIdRef.current) await attachTracking(journeyIdRef.current);
  }, [attachTracking, updateRoutePreferences]);

  /**
   * Pausing stops the counting as well as the clock.
   *
   * Leaving the feed running through a break put the kilometres driven to
   * lunch into `distance_gps` while the same minutes were excluded from
   * `paused_seconds` — a denominator inflated and a numerator not, which skews
   * every per-km figure the product exists to get right.
   *
   * Halting first, but never at the cost of the pause itself: if the OS
   * refuses to stop the feed, the break still has to be banked, because
   * counting it as worked time is the larger of the two errors.
   */
  const pauseJourney = useCallback(async () => {
    await tracking.halt().catch(() => undefined);
    await pause();
  }, [pause, tracking]);

  const resumeJourney = useCallback(async () => {
    await resume();
    if (journey) await tracking.resume(journey.id).catch(() => undefined);
  }, [journey, resume, tracking]);

  const sheets = (
    <>
      <RouteConsentSheet
        visible={askingConsent}
        onAccept={() => void acceptCapture()}
        onDecline={() => void declineCapture()}
      />
      <BackgroundConsentSheet
        visible={askingBackground}
        onAccept={() => {
          setAskingBackground(false);
          void tracking.askBackground();
        }}
        onDecline={() => setAskingBackground(false)}
      />
    </>
  );

  return { begin, pause: pauseJourney, resume: resumeJourney, tracking, sheets };
}
