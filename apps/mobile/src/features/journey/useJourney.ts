import { useCallback, useEffect, useState } from 'react';
import type { Cents, DistanceSource, Metres } from '@dinamique/types';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
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
 * in the database, so this hook does not have to defend against races.
 */
export function useActiveJourney() {
  const { session } = useSession();
  const [journey, setJourney] = useState<ActiveJourney | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setJourney(null);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('journeys')
      .select('id, status, started_at, paused_seconds, paused_at, odometer_start')
      .eq('user_id', session.user.id)
      .in('status', ['active', 'paused'])
      .maybeSingle();

    // A query that failed says nothing about whether a journey is running.
    // Clearing it here is what put "Nenhuma jornada em andamento" on screen
    // for a driver whose shift was open and whose signal had dropped.
    if (error) {
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
  }, [session?.user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Returns the new journey's id.
   *
   * The caller needs it immediately — GPS capture is keyed by journey — and
   * reading it off `journey` instead would hand back the previous render's
   * snapshot, which at this point is still null.
   */
  const start = useCallback(
    async (odometerStart: Metres | null): Promise<string | null> => {
      if (!session?.user) return null;
      const { data } = await supabase
        .from('journeys')
        .insert({
          user_id: session.user.id,
          started_at: new Date().toISOString(),
          status: 'active',
          odometer_start: odometerStart,
        })
        .select('id')
        .maybeSingle();

      void track('journey_started', {});
      await refresh();
      return data ? String(data.id) : null;
    },
    [refresh, session?.user?.id],
  );

  const pause = useCallback(async () => {
    if (!journey) return;
    await supabase
      .from('journeys')
      .update({ status: 'paused', paused_at: new Date().toISOString() })
      .eq('id', journey.id);
    void track('journey_paused', {});
    await refresh();
  }, [journey, refresh]);

  const resume = useCallback(async () => {
    if (!journey?.pausedAt) return;
    // The pause is banked as seconds, so worked time stays correct even if the
    // app was closed for the whole break.
    const extra = Math.max(0, Math.round((Date.now() - Date.parse(journey.pausedAt)) / 1000));
    await supabase
      .from('journeys')
      .update({
        status: 'active',
        paused_at: null,
        paused_seconds: journey.pausedSeconds + extra,
      })
      .eq('id', journey.id);
    await refresh();
  }, [journey, refresh]);

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

      // The caller needs to know whether this landed: the GPS buffer on the
      // device is only safe to delete once the row is actually written.
      //
      // `select()` because a PostgREST update that matched nothing reports no
      // error at all. Trusting that would confirm the driver's day, emit a
      // completion event and release the buffer over a row that was never
      // touched — an id that moved, or an RLS policy that said no.
      const { data, error } = await supabase
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

      // `journey_completed` is emitted by the close screen, which knows what
      // the journey actually contained. Firing it here too would have put two
      // events with different properties under one name in the warehouse.
      await refresh();
      return !error && data !== null;
    },
    [journey, refresh],
  );

  return { journey, loading, refresh, start, pause, resume, finish };
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
