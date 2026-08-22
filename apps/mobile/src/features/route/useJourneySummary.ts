import { useEffect, useState } from 'react';
import type { Cents, DateOnly, Metres, Seconds } from '@dinamique/types';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export interface DaySummary {
  date: DateOnly;
  grossRevenue: Cents;
  netProfit: Cents;
  workedSeconds: Seconds;
  /** Null when the day has no distance at all — never zero (§6). */
  distance: Metres | null;
  /** Null without a distance to divide by, which is the same rule. */
  revenuePerKm: Cents | null;
}

/**
 * The day's figures, read from the same view the history reads.
 *
 * Not recomputed on the phone from the journey rows: the replay, the history
 * and the story card must show one number, and the only way to guarantee that
 * is for them to ask the same question of the same view.
 */
export function useDaySummary(date: DateOnly | null) {
  const { session } = useSession();
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!session?.user || !date) {
      setSummary(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from('daily_totals')
        .select('date, gross_revenue, net_profit, worked_seconds, distance')
        .eq('user_id', session.user.id)
        .eq('date', date)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setSummary(null);
        setLoading(false);
        return;
      }

      const row = data as {
        date: DateOnly;
        gross_revenue: number;
        net_profit: number;
        worked_seconds: number;
        distance: number;
      };

      // The view coalesces a missing distance to 0 so it can be summed. Here
      // it becomes null again: a day with no kilometres has no R$/km, and
      // dividing by zero to show "R$ 0,00/km" would be a lie the driver could
      // not tell was one.
      const distance = row.distance > 0 ? row.distance : null;

      setSummary({
        date: row.date,
        grossRevenue: row.gross_revenue,
        netProfit: row.net_profit,
        workedSeconds: row.worked_seconds,
        distance,
        revenuePerKm:
          distance === null ? null : Math.round(row.gross_revenue / (distance / 1000)),
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, date]);

  return { summary, loading };
}
