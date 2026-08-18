import { useCallback, useEffect, useState } from 'react';
import type { Cents } from '@dinamique/types';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';

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
    const { data } = await supabase
      .from('journeys')
      .select('id, status, started_at, paused_seconds, paused_at, odometer_start')
      .eq('user_id', session.user.id)
      .in('status', ['active', 'paused'])
      .maybeSingle();

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

  const start = useCallback(
    async (odometerStart: number | null) => {
      if (!session?.user) return;
      await supabase.from('journeys').insert({
        user_id: session.user.id,
        started_at: new Date().toISOString(),
        status: 'active',
        odometer_start: odometerStart,
      });
      void track('journey_started', {});
      await refresh();
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
    async (input: { odometerEnd: number | null; distanceOverride: number | null }) => {
      if (!journey) return;
      const now = new Date();
      const extra = journey.pausedAt
        ? Math.max(0, Math.round((now.getTime() - Date.parse(journey.pausedAt)) / 1000))
        : 0;

      await supabase
        .from('journeys')
        .update({
          status: 'completed',
          ended_at: now.toISOString(),
          paused_at: null,
          paused_seconds: journey.pausedSeconds + extra,
          odometer_end: input.odometerEnd,
          distance_override: input.distanceOverride,
        })
        .eq('id', journey.id);

      void track('journey_completed', {});
      await refresh();
    },
    [journey, refresh],
  );

  return { journey, loading, refresh, start, pause, resume, finish };
}

export async function addRevenue(input: {
  userId: string;
  journeyId: string | null;
  platformId: string | null;
  amount: Cents;
  tips: Cents;
  tripCount: number | null;
  date: string;
}): Promise<void> {
  await supabase.from('revenues').insert({
    user_id: input.userId,
    journey_id: input.journeyId,
    platform_id: input.platformId,
    amount: input.amount,
    tips: input.tips,
    trip_count: input.tripCount,
    date: input.date,
  });
  void track('revenue_added', { platform_id: input.platformId });
}

export async function addExpense(input: {
  userId: string;
  journeyId: string | null;
  categoryId: string;
  amount: Cents;
  date: string;
}): Promise<void> {
  await supabase.from('expenses').insert({
    user_id: input.userId,
    journey_id: input.journeyId,
    category_id: input.categoryId,
    amount: input.amount,
    date: input.date,
  });
  void track('expense_added', { category_id: input.categoryId });
}
