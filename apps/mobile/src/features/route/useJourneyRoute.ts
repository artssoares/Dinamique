import { useCallback, useEffect, useState } from 'react';
import type { DateOnly, LatLng } from '@dinamique/types';
import { decodePolyline, toDateOnly } from '@dinamique/utils';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { localDayRange } from './routeDates';

export interface JourneyRoute {
  journeyId: string;
  points: LatLng[];
  /** Metres, as the journey filed them — not recomputed from the drawing. */
  distance: number | null;
}

/**
 * The drawing of one journey.
 *
 * The polyline is decoded here rather than stored decoded: 1 000 points is
 * about 7 KB of ASCII and roughly 40 KB as an array of objects, and the
 * history screen would be holding a week of them.
 */
export function useJourneyRoute(journeyId: string | null) {
  const [route, setRoute] = useState<JourneyRoute | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!journeyId) {
      setRoute(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from('journey_routes')
        .select('journey_id, polyline, precision, journeys(distance_gps)')
        .eq('journey_id', journeyId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setRoute(null);
        setLoading(false);
        return;
      }

      const row = data as {
        journey_id: string;
        polyline: string;
        precision: number | null;
        journeys: { distance_gps: number | null } | { distance_gps: number | null }[] | null;
      };

      // PostgREST returns an embedded one-to-one as an object or, depending on
      // how it reads the relationship, as a one-element array. Both shapes
      // have shipped from this endpoint, so both are handled rather than
      // trusted.
      const journey = Array.isArray(row.journeys) ? row.journeys[0] : row.journeys;

      setRoute({
        journeyId: row.journey_id,
        // The stored precision, not the constant: a route written by an older
        // build must keep decoding to the streets it was recorded on.
        points: decodePolyline(row.polyline, row.precision ?? undefined),
        distance: journey?.distance_gps ?? null,
      });
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [journeyId]);

  return { route, loading };
}

/**
 * Which of the driver's days have a drawing, for the glyph in the history.
 *
 * One query for the whole period rather than one per row — a month of days
 * would otherwise be thirty round trips to decide whether to draw an icon.
 * Nothing is decoded here: this only answers yes or no.
 *
 * The question is asked of `journey_routes`, through an inner join, rather
 * than of `journeys.route_point_count`. That column is an audit trail, not
 * proof: it is written when the journey closes, *before* the optional route
 * upload, and it survives the retention job that deletes the drawing ninety
 * days later. Trusting it left a glyph on days whose route had expired, or
 * whose upload had failed, and every one of them opened an empty screen.
 */
export function useRouteDays(start: DateOnly, end: DateOnly) {
  const { session } = useSession();
  const [days, setDays] = useState<Set<DateOnly>>(new Set());

  const load = useCallback(async () => {
    if (!session?.user) return;

    const from = localDayRange(start).start;
    const to = localDayRange(end).end;

    const { data, error } = await supabase
      .from('journeys')
      .select('started_at, journey_routes!inner(journey_id)')
      .eq('user_id', session.user.id)
      .gte('started_at', from)
      .lt('started_at', to);

    // A failed read means "we do not know", which shows as no glyph. Never a
    // glyph that opens an empty screen.
    if (error || !data) return;

    setDays(
      new Set(
        (data as { started_at: string }[]).map((row) => toDateOnly(new Date(row.started_at))),
      ),
    );
  }, [session?.user?.id, start, end]);

  useEffect(() => {
    void load();
  }, [load]);

  return days;
}

export interface DayJourney {
  id: string;
  startedAt: string;
  endedAt: string | null;
  distanceGps: number | null;
}

/**
 * Every journey of a day that has a drawing, in the order they were driven.
 *
 * All of them, not the longest: a driver who ran a morning shift and an
 * evening one made two routes and gets two films. The inner join is what
 * proves a drawing still exists (see `useRouteDays`), and `started_at` then
 * `id` order them, so the same day never lists its shifts two different ways.
 */
export function useDayJourneys(date: DateOnly | null) {
  const { session } = useSession();
  const [journeys, setJourneys] = useState<DayJourney[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!session?.user || !date) {
      setJourneys([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const range = localDayRange(date);

    void (async () => {
      const { data } = await supabase
        .from('journeys')
        .select('id, started_at, ended_at, distance_gps, journey_routes!inner(journey_id)')
        .eq('user_id', session.user.id)
        .gte('started_at', range.start)
        .lt('started_at', range.end)
        .order('started_at', { ascending: true })
        .order('id', { ascending: true });

      if (cancelled) return;
      const rows =
        (data as
          | { id: string; started_at: string; ended_at: string | null; distance_gps: number | null }[]
          | null) ?? [];
      setJourneys(
        rows.map((row) => ({
          id: row.id,
          startedAt: row.started_at,
          endedAt: row.ended_at,
          distanceGps: row.distance_gps,
        })),
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, date]);

  return { journeys, loading };
}
