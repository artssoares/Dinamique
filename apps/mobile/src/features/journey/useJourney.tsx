import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Cents, DistanceSource, Metres } from '@dinamique/types';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { toFriendlyError } from '@/lib/errors';
import { useSession } from '@/hooks/useSession';
import type { SyncableTable } from '@/features/offline/queue';

/** Assinatura de `save` do OfflineProvider. */
type SaveFn = (table: SyncableTable, payload: Record<string, unknown>) => Promise<boolean>;

export interface ActiveJourney {
  id: string;
  status: 'active' | 'paused';
  startedAt: string;
  pausedSeconds: number;
  pausedAt: string | null;
  odometerStart: number | null;
}

/**
 * Journey lifecycle (§25). One journey at a time is enforced by a unique index
 * in the database, so this does not have to defend against races.
 *
 * This is deliberately a provider rather than a plain hook. It used to be a
 * hook, and every screen that called it kept its own copy of the state: you
 * could start a journey on Registrar and Home would still show no journey
 * running, because Home had fetched once on mount and nothing told it to look
 * again. One state, shared, is the whole fix.
 *
 * Two rules the earlier version broke, and which are the reason "Iniciar" did
 * nothing at all:
 *
 *   1. The provider must hand consumers the CURRENT callbacks. It used to
 *      memoise the whole object on the journey's own fields, so the closures
 *      captured at first render, when there was no session yet, were the
 *      ones every screen kept calling. `start` began with `if (!session?.user)
 *      return;` and returned, forever, without a sound.
 *   2. A write that fails has to say so. Every mutation ignored Supabase's
 *      error, so a rejected insert and a successful one looked identical from
 *      the outside: nothing on screen changed either way.
 */
function useJourneyState() {
  const { session } = useSession();
  const [journey, setJourney] = useState<ActiveJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user?.id ?? null;

  const refresh = useCallback(async () => {
    if (!userId) {
      setJourney(null);
      setLoading(false);
      return;
    }
    const { data, error: readError } = await supabase
      .from('journeys')
      .select('id, status, started_at, paused_seconds, paused_at, odometer_start')
      .eq('user_id', userId)
      .in('status', ['active', 'paused'])
      .maybeSingle();

    if (readError) {
      setError(toFriendlyError(readError).message);
      setLoading(false);
      return;
    }

    setJourney(
      data
        ? {
            id: String(data.id),
            status: data.status as 'active' | 'paused',
            startedAt: String(data.started_at),
            pausedSeconds: Number(data.paused_seconds ?? 0),
            pausedAt: (data.paused_at as string | null) ?? null,
            odometerStart: (data.odometer_start as number | null) ?? null,
          }
        : null,
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Runs one write and reports the truth about it. `busy` drives the spinner
   * on whichever control was pressed, so a slow connection looks like work in
   * progress rather than a dead button.
   */
  const run = useCallback(
    // PromiseLike, not Promise: a Supabase query builder is a thenable that
    // only becomes a request when it is awaited.
    async (write: () => PromiseLike<{ error: unknown } | void>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const result = await write();
        const writeError = result && 'error' in result ? result.error : null;
        if (writeError) {
          setError(toFriendlyError(writeError).message);
          return false;
        }
        await refresh();
        return true;
      } catch (thrown) {
        setError(toFriendlyError(thrown).message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const start = useCallback(
    async (odometerStart: number | null) => {
      if (!userId) {
        setError('Entre na sua conta para iniciar uma jornada.');
        return false;
      }
      // Uma jornada já aberta não é erro: é o que a pessoa queria de qualquer
      // forma, então só sincronizamos e seguimos.
      if (journey) {
        await refresh();
        return true;
      }
      const ok = await run(() =>
        supabase.from('journeys').insert({
          user_id: userId,
          started_at: new Date().toISOString(),
          status: 'active',
          odometer_start: odometerStart,
        }),
      );
      if (ok) void track('journey_started', {});
      return ok;
    },
    [journey, refresh, run, userId],
  );

  const pause = useCallback(async () => {
    if (!journey) return false;
    const ok = await run(() =>
      supabase
        .from('journeys')
        .update({ status: 'paused', paused_at: new Date().toISOString() })
        .eq('id', journey.id),
    );
    if (ok) void track('journey_paused', {});
    return ok;
  }, [journey, run]);

  const resume = useCallback(async () => {
    if (!journey?.pausedAt) return false;
    // The pause is banked as seconds, so worked time stays correct even if the
    // app was closed for the whole break.
    const extra = Math.max(0, Math.round((Date.now() - Date.parse(journey.pausedAt)) / 1000));
    return run(() =>
      supabase
        .from('journeys')
        .update({
          status: 'active',
          paused_at: null,
          paused_seconds: journey.pausedSeconds + extra,
        })
        .eq('id', journey.id),
    );
  }, [journey, run]);

  const finish = useCallback(
    async (input: {
      odometerEnd: Metres | null;
      distanceOverride: Metres | null;
      /** The raw GPS measurement, kept as the audit trail behind the replay. */
      distanceGps?: Metres | null;
      routePointCount?: number | null;
      distanceSource?: DistanceSource | null;
    }): Promise<boolean> => {
      if (!journey) return false;
      const now = new Date();
      const extra = journey.pausedAt
        ? Math.max(0, Math.round((now.getTime() - Date.parse(journey.pausedAt)) / 1000))
        : 0;

      // `select()` because a PostgREST update that matched nothing reports no
      // error at all. Trusting that would confirm the driver's day, emit a
      // completion event and release the GPS buffer on the device over a row
      // that was never touched — an id that moved, or an RLS policy saying no.
      let matched = false;
      const ok = await run(async () => {
        const result = await supabase
          .from('journeys')
          .update({
            status: 'completed',
            ended_at: now.toISOString(),
            paused_at: null,
            paused_seconds: journey.pausedSeconds + extra,
            odometer_end: input.odometerEnd,
            distance_override: input.distanceOverride,
            distance_gps: input.distanceGps ?? null,
            route_point_count: input.routePointCount ?? null,
            distance_source: input.distanceSource ?? null,
          })
          .eq('id', journey.id)
          .select('id')
          .maybeSingle();
        matched = result.data !== null;
        return result;
      });

      // `journey_completed` is emitted by the close screen, which knows what
      // the journey actually contained — the platforms, whether a distance was
      // recorded, where that distance came from. Firing it here as well would
      // put two events with different properties under one name.
      return ok && matched;
    },
    [journey, run],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { journey, loading, busy, error, dismissError, refresh, start, pause, resume, finish };
}

export type JourneyState = ReturnType<typeof useJourneyState>;

const JourneyContext = createContext<JourneyState | null>(null);

/**
 * No memo here on purpose. The value has to change whenever any part of it
 * does, callbacks included, or screens go on calling a closure that captured
 * a session that did not exist yet.
 */
export function JourneyProvider({ children }: { children: ReactNode }) {
  const value = useJourneyState();
  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>;
}

export function useActiveJourney(): JourneyState {
  const context = useContext(JourneyContext);
  if (!context) {
    throw new Error('useActiveJourney must be used inside a <JourneyProvider>.');
  }
  return context;
}

/**
 * Lançamentos passam pela camada offline (§111): com rede vão direto, sem rede
 * ficam guardados no aparelho e sobem sozinhos depois. `save` devolve false
 * quando o registro foi para a fila, para a tela poder avisar.
 */
export async function addRevenue(
  save: SaveFn,
  input: {
    userId: string;
    journeyId: string | null;
    platformId: string | null;
    amount: Cents;
    tips: Cents;
    tripCount: number | null;
    date: string;
  },
): Promise<boolean> {
  const sent = await save('revenues', {
    user_id: input.userId,
    journey_id: input.journeyId,
    platform_id: input.platformId,
    amount: input.amount,
    tips: input.tips,
    trip_count: input.tripCount,
    date: input.date,
  });
  void track('revenue_added', { platform_id: input.platformId, offline: !sent });
  return sent;
}

export async function addExpense(
  save: SaveFn,
  input: {
    userId: string;
    journeyId: string | null;
    categoryId: string;
    amount: Cents;
    date: string;
  },
): Promise<boolean> {
  const sent = await save('expenses', {
    user_id: input.userId,
    journey_id: input.journeyId,
    category_id: input.categoryId,
    amount: input.amount,
    date: input.date,
  });
  void track('expense_added', { category_id: input.categoryId, offline: !sent });
  return sent;
}
