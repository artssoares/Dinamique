import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Metres } from '@dinamique/types';
import { summariseTrack, type TrackSummary } from '@dinamique/business-logic';
import { track } from '@/lib/analytics';
import { runningJourneyId } from '@/features/journey/runningJourneyId';
import {
  clearRoute,
  getActiveRoute,
  liveDistance as readBufferedDistance,
  pruneOrphanBuffers,
  readBreaks,
  readRoute,
  wasDeliberateStop,
} from './buffer';
import { capturePermitted } from './capturePermitted';
import { locationService } from './locationService';
import { currentPermission, requestBackground, requestForeground } from './permission';
import type { PermissionOutcome } from './types';

/** How often the live figure on the journey card refreshes. */
const LIVE_REFRESH_MS = 20_000;

export interface JourneyTracking {
  /** True once the OS is feeding positions for this journey. */
  tracking: boolean;
  /** False when the driver allowed only "while using the app". */
  background: boolean;
  /** Metres so far, or null while the track is still too thin to trust. */
  liveDistance: Metres | null;
  /** True when we had to re-register after the device was restarted. */
  recovered: boolean;
  begin: (journeyId: string) => Promise<PermissionOutcome>;
  /** Resume a shift already in the buffer, without clearing it. */
  resume: (journeyId: string) => Promise<void>;
  /** Stop the OS feed without reading or clearing anything. */
  halt: () => Promise<void>;
  askBackground: () => Promise<void>;
  finish: (journeyId: string) => Promise<TrackSummary | null>;
  release: (journeyId: string) => Promise<void>;
}

/**
 * Capture tied to the life of one journey.
 *
 * The hook owns three awkward realities:
 *
 *  - a device reboot silently unregisters the task, so an app that comes back
 *    to a still-open journey has to notice and re-register;
 *  - the buffer must outlive a failed upload, so `finish()` reads and
 *    summarises but does not delete — `release()` does, and only the caller
 *    that has confirmed the row was written may call it;
 *  - none of this may inconvenience a driver who said no. Every path here is
 *    reachable only when the preference is on and the permission was granted.
 */
export function useJourneyTracking(
  journeyId: string | null,
  /**
   * Whether this instance may re-register a dropped task.
   *
   * Only the screen that owns the running journey should. The close screen
   * mounts the same hook to read the shift, and a recovery there would race
   * its own `finish()` — re-registering background location for a journey that
   * has just ended, and reopening a buffer that is about to be released.
   */
  { recover = true }: { recover?: boolean } = {},
): JourneyTracking {
  const [tracking, setTracking] = useState(false);
  const [background, setBackground] = useState(false);
  const [liveDistance, setLiveDistance] = useState<Metres | null>(null);
  const [recovered, setRecovered] = useState(false);

  const readLive = useCallback(async (id: string) => {
    // One key. The buffer keeps a running total as fixes arrive, so this does
    // not parse the shift or re-run the filter over it — which by hour eight
    // would be half a megabyte and a full Douglas-Peucker pass, every twenty
    // seconds, on the phone of someone who is driving.
    setLiveDistance(await readBufferedDistance(id));
  }, []);

  /**
   * Re-registers a task the OS is no longer running.
   *
   * Deliberately not latched. Remembering that it had tried once meant a task
   * dropped later in the shift — after a pause, or reclaimed by the system —
   * was never picked back up, and the driver stopped being counted with
   * nothing on screen to say so. Running it again is two storage reads and an
   * early return when everything is fine.
   */
  const attemptRecovery = useCallback(async (id: string) => {
    // `getActiveRoute` throws by design on an unreadable key, and this is the
    // effect's first await — an escaping rejection meant `readLive` never ran
    // and recovery never happened again, silently, for the whole session.
    const active = await getActiveRoute().catch(() => null);
    const running = await locationService.isTracking().catch(() => true);
    setTracking(running);

    // Read whenever anything is running, not only on the recovery path.
    // Setting it solely there meant a cold start with the task still
    // registered told a driver who granted "Sempre" that we were counting
    // "só com o app aberto".
    if (running) setBackground((await currentPermission()).background);

    if (running || active?.journeyId !== id) return;

    // Our own stop is not a restart. The close wizard halts capture the moment
    // it opens and the settings screen halts it on a toggle; without this,
    // backing out of that wizard put "O aparelho reiniciou" on the Record card
    // about a stop the app had made itself.
    const deliberate = await wasDeliberateStop();

    // The OS grant is not consent. Nothing clears the active-route key when
    // the driver switches capture off, so without this an app restart would
    // resurrect tracking after they withdrew it.
    const allowed = await capturePermitted();
    // Unanswerable: leave it for the focus retry rather than abandoning
    // capture for the rest of the shift over one blip.
    if (allowed === null) return;

    // A paused journey is not one to resume counting for: reopening the app
    // during a break would put break kilometres into the distance while those
    // minutes stayed out of the worked time.
    if ((await runningJourneyId()) !== id) return;

    const permission = await currentPermission();
    if (!allowed || !permission.granted) return;

    try {
      await locationService.start(id);
    } catch {
      // The OS refused. The focus retry will come round again; announcing a
      // recovery that did not happen would be worse than staying quiet.
      return;
    }
    setTracking(true);
    setBackground(permission.background);
    // Only claimed when the stop was not ours to explain.
    if (!deliberate) setRecovered(true);
  }, []);

  useEffect(() => {
    // A restart belongs to the journey it interrupted; the notice must not
    // follow the driver into the next shift.
    setRecovered(false);
    if (!journeyId) {
      setTracking(false);
      setLiveDistance(null);
      return;
    }
    if (!recover) return;

    void (async () => {
      await attemptRecovery(journeyId);
      await readLive(journeyId);
    })();
  }, [journeyId, recover, readLive, attemptRecovery]);

  /**
   * Drop buffers nobody came back for.
   *
   * Its own effect, with no journey and no recovery gate, because the case it
   * exists for is precisely the driver who stopped opening journeys — the one
   * whose abandoned positions would otherwise sit on the device for ever.
   */
  useEffect(() => {
    void pruneOrphanBuffers(journeyId);
  }, [journeyId]);

  /**
   * Re-samples the OS as well as the figure, and runs whether or not we think
   * we are tracking.
   *
   * Another screen can start or stop capture while this one is mounted — the
   * close wizard hands it back on its way out, the settings screen switches it
   * off — and a one-shot sample taken a moment too early would latch the wrong
   * answer for the rest of the shift.
   */
  useEffect(() => {
    if (!journeyId) return;
    const timer = setInterval(() => {
      void (async () => {
        const running = await locationService.isTracking().catch(() => false);
        setTracking(running);
        if (running) await readLive(journeyId);
      })();
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [journeyId, readLive]);

  useFocusEffect(
    useCallback(() => {
      if (!journeyId) return;
      void (async () => {
        const running = await locationService.isTracking().catch(() => false);
        setTracking(running);
        setBackground(running ? (await currentPermission()).background : false);
        await readLive(journeyId);
        // Coming back to the screen is the retry the `allowed === null`
        // bail-out depends on — without it, one blip at cold start abandoned
        // capture for the rest of the shift.
        if (recover && !running) await attemptRecovery(journeyId);
      })();
    }, [journeyId, recover, readLive, attemptRecovery]),
  );

  const begin = useCallback(async (id: string) => {
    const permission = await requestForeground();
    if (!permission.granted) {
      void track('route_capture_denied', { stage: permission.deniedAt });
      return permission;
    }

    try {
      await locationService.start(id);
    } catch {
      // The OS refused to start the updates. Reporting it as ungranted is the
      // honest answer — the caller alerts and puts the preference back —
      // rather than letting the rejection escape and leaving a journey running
      // with capture silently off.
      setTracking(false);
      return { granted: false, background: false, deniedAt: 'foreground' as const };
    }
    setTracking(true);
    setLiveDistance(null);

    // `requestForeground` only speaks for the foreground grant. Reporting
    // `background: false` from it would re-ask a driver who already said yes
    // at every shift, and label the card "só com o app aberto" while the OS
    // was happily counting in the background.
    const held = await currentPermission();
    setBackground(held.background);
    return { ...permission, background: held.background };
  }, []);

  /**
   * The second ask, and only ever after the journey is visibly running.
   *
   * A cold "Always" request is denied by most drivers and rejected by App Store
   * review; asked once the card is on screen counting, it is a request the
   * person can actually evaluate.
   */
  const askBackground = useCallback(async () => {
    const outcome = await requestBackground();
    setBackground(outcome.background);
    if (!outcome.background) {
      void track('route_capture_denied', { stage: 'background' });
    }
  }, []);

  /**
   * Stops the OS feed and nothing else.
   *
   * The close screen needs this on a retry: a rejected close hands capture
   * back, and the attempt that finally succeeds has to take it away again —
   * otherwise GPS and the Android notification keep running after the journey
   * is filed, across app restarts.
   */
  const halt = useCallback(async () => {
    await locationService.stop();
    setTracking(false);
  }, []);

  /**
   * Picks capture back up for a journey that is still open.
   *
   * The close wizard stops counting the moment it opens — the driver has
   * stopped driving. But backing out of the wizard means they have not, and
   * without this the rest of the shift would go uncounted with nothing on
   * screen to suggest it. The buffer survives, so this resumes rather than
   * restarts.
   */
  const resume = useCallback(async (id: string) => {
    // Only an explicit yes resumes. Unknown is not consent.
    if ((await capturePermitted()) !== true) return;
    // And only for a journey that is actually running — a break is not a gap
    // to fill in.
    if ((await runningJourneyId()) !== id) return;
    const permission = await currentPermission();
    if (!permission.granted) return;
    try {
      await locationService.start(id);
    } catch {
      return;
    }
    setTracking(true);
    setBackground(permission.background);
  }, []);

  /**
   * Stops capture and reports what the shift measured.
   *
   * Deliberately does not clear the buffer. If the caller's write fails, the
   * day is still on the device and the next app open can finish the job.
   */
  const finish = useCallback(async (id: string) => {
    await locationService.stop();
    setTracking(false);

    const fixes = await readRoute(id);
    if (fixes.length === 0) return null;

    // The breaks come from the device, which knows exactly when it stopped and
    // started. Inferring them from gap length misses a stop short enough to
    // look like an ordinary pause between readings.
    return summariseTrack(fixes, await readBreaks(id));
  }, []);

  const release = useCallback(async (id: string) => {
    await clearRoute(id);
    setLiveDistance(null);
    setRecovered(false);
  }, []);

  return {
    tracking,
    background,
    liveDistance,
    recovered,
    begin,
    resume,
    halt,
    askBackground,
    finish,
    release,
  };
}
