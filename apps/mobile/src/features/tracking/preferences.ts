import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { openJourneyId, runningJourneyId } from '@/features/journey/runningJourneyId';
import { clearAllRoutes } from './buffer';
import { locationService } from './locationService';

/** The app's default. Null in the database means "guardar para sempre". */
export const DEFAULT_ROUTE_RETENTION_DAYS = 90;

export const RETENTION_CHOICES = [
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 365, label: '1 ano' },
  { value: null, label: 'Sempre' },
] as const;

export interface RoutePreferences {
  captureEnabled: boolean;
  trimShared: boolean;
  /** Null means "guardar para sempre" — an explicit choice, never a default. */
  retentionDays: number | null;
  /** True once the driver has been asked, whatever they answered. */
  prompted: boolean;
}

const DEFAULTS: RoutePreferences = {
  // Opt-in, never opt-out. Nothing is captured until the driver says so.
  captureEnabled: false,
  trimShared: true,
  retentionDays: DEFAULT_ROUTE_RETENTION_DAYS,
  prompted: false,
};

const COLUMNS =
  'route_capture_enabled, route_trim_shared, route_retention_days, route_capture_prompted';

function fromRow(row: Record<string, unknown> | null): RoutePreferences {
  if (!row) return DEFAULTS;
  return {
    captureEnabled: Boolean(row.route_capture_enabled),
    trimShared: row.route_trim_shared !== false,
    retentionDays: (row.route_retention_days as number | null) ?? null,
    prompted: Boolean(row.route_capture_prompted),
  };
}

/**
 * The driver's standing answer about route capture.
 *
 * Read defensively: a preferences row that has not loaded yet, or a project
 * without Supabase configured, must read as "capture off" rather than throwing
 * or — far worse — defaulting to on.
 */
export function useRoutePreferences() {
  const { session } = useSession();
  const [preferences, setPreferences] = useState<RoutePreferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  /**
   * True once a read has actually succeeded.
   *
   * `loading` cannot carry this: it goes false on a failed query too, so a
   * caller using it to mean "we know the answer" would read the defaults —
   * capture off — as a real refusal. At close that costs the shift's GPS data
   * permanently, because nothing re-reads a closed journey's buffer.
   */
  const [known, setKnown] = useState(false);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setPreferences(DEFAULTS);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select(COLUMNS)
      .eq('user_id', session.user.id)
      .maybeSingle();

    // A failed read is not an answer. Painting the defaults over it showed the
    // capture switch off while recording was live, and snapped the retention
    // chip back to 90 days — including right after `update()` awaited this,
    // which made a toggle appear to undo itself under the driver's thumb.
    if (error) {
      setLoading(false);
      return;
    }

    setPreferences(fromRow(data as Record<string, unknown> | null));
    setKnown(true);
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Reads straight from the database rather than from state, and says so when
   * it could not.
   *
   * Starting a journey has to know the real answer *now*: the hook's state on
   * a cold start is the defaults — capture off — which would show the consent
   * sheet to someone who opted in months ago.
   *
   * Returning `null` on failure rather than the defaults is the important
   * half. A caller that reads a failed query as "capture is off" will skip the
   * upload and then release the buffer, deleting the driver's day on the
   * strength of a network error.
   */
  const read = useCallback(async (): Promise<RoutePreferences | null> => {
    if (!session?.user) return DEFAULTS;
    const { data, error } = await supabase
      .from('user_preferences')
      .select(COLUMNS)
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error) return null;

    const fresh = fromRow(data as Record<string, unknown> | null);
    setPreferences(fresh);
    setKnown(true);
    setLoading(false);
    return fresh;
  }, [session?.user?.id]);

  const update = useCallback(
    async (patch: Partial<RoutePreferences>): Promise<boolean> => {
      if (!session?.user) return false;
      const before = preferences;
      // Optimistic: a toggle that lags behind the thumb feels broken.
      setPreferences((current) => ({ ...current, ...patch }));

      // `select()` because a PostgREST update that matched no row — a
      // preferences row that was never created — reports no error, and consent
      // would read as saved while the server still said no. At close that
      // `false` drops the distance, drops the route, and releases the buffer.
      const { data, error } = await supabase
        .from('user_preferences')
        .update({
          ...(patch.captureEnabled !== undefined
            ? { route_capture_enabled: patch.captureEnabled }
            : {}),
          ...(patch.trimShared !== undefined ? { route_trim_shared: patch.trimShared } : {}),
          ...(patch.retentionDays !== undefined
            ? { route_retention_days: patch.retentionDays }
            : {}),
          ...(patch.prompted !== undefined ? { route_capture_prompted: patch.prompted } : {}),
        })
        .eq('user_id', session.user.id)
        .select('user_id')
        .maybeSingle();

      // A write that did not land must not stay on screen as though it had.
      // `refresh()` deliberately preserves state on a read error, so without
      // this an unsaved withdrawal of consent would look applied — while the
      // server, and anything reading it later, still said yes.
      if (error || data === null) {
        setPreferences(before);
        return false;
      }

      await refresh();
      return true;
    },
    [preferences, refresh, session?.user?.id],
  );

  /**
   * "Apagar todos os meus trajetos" — the drawings go, the money stays.
   *
   * This is the whole reason the polyline is not a column on `journeys`: the
   * driver can erase where they went without erasing what they earned.
   */
  const deleteAllRoutes = useCallback(async (): Promise<boolean> => {
    if (!session?.user) return false;
    const { error } = await supabase
      .from('journey_routes')
      .delete()
      .eq('user_id', session.user.id);

    // The local copy is not deleted when the server copy survived. Wiping it
    // anyway and reporting success would tell someone their trails were gone
    // while every polyline sat on the server — and destroy the only copy that
    // could have proved otherwise.
    if (error) return false;

    // Stop first: wiping the active-route key while the OS is still feeding
    // the task leaves it waking up, discarding every fix, and showing an
    // Android notification that claims to be counting.
    await locationService.stop();

    // The open shift is spared — open, not merely running. A driver on their
    // lunch break has a whole morning in that buffer. The confirmation
    // promises the kilometres are untouched: this deletes history, not the day
    // being lived.
    const open = await openJourneyId().catch(() => null);
    await clearAllRoutes(open);

    const { data, error: readError } = await supabase
      .from('user_preferences')
      .select('route_capture_enabled')
      .eq('user_id', session.user.id)
      .maybeSingle();

    // The wipe removed the active-route key, so recovery can no longer pick
    // this shift back up on its own. If we cannot tell whether to restart, the
    // caller has to say so — otherwise the rest of the day goes uncounted with
    // the switch still reading "on".
    if (readError) return false;
    if (!data?.route_capture_enabled) return true;

    // Restarting, though, is about a *running* journey: resuming capture for a
    // paused one would count the break.
    const running = await runningJourneyId().catch(() => null);
    if (!running) return true;

    try {
      await locationService.start(running);
      return true;
    } catch {
      return false;
    }
  }, [session?.user?.id]);

  return { preferences, loading, known, refresh, read, update, deleteAllRoutes };
}
