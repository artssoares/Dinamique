import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from '@dinamique/types';
import { summarisePeriod, type PeriodSummary } from '@dinamique/business-logic';
import { buildRecap, fixesFromRoute, type RawFix, type Recap } from '@dinamique/recap';
import { darkTokens, lightTokens } from '@dinamique/ui';
import { decodePolyline } from '@dinamique/utils';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { filmBasemap } from './basemap';

/**
 * Builds the film of one journey from the database.
 *
 * The only work here is reading rows and handing them on. How much the day
 * earned comes from `summarisePeriod`, the same function Hoje and the admin
 * use, which is what stops the film saying one number and the screen another.
 * The choreography comes from `@dinamique/recap`. This layer calculates
 * nothing.
 *
 * The route is the one the replay draws: the polyline in `journey_routes`,
 * decoded at the precision it was stored with, whole. The film shows the
 * entire drive, start to end; the privacy cut the story card makes at both
 * ends is not applied here, by the product owner's decision.
 */

interface JourneyRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  paused_seconds: number;
  odometer_start: number | null;
  odometer_end: number | null;
  distance_override: number | null;
  distance_gps: number | null;
}

interface RevenueRow {
  date: string;
  amount: number;
  tips: number;
  trip_count: number | null;
  platform_id: string | null;
}

interface ExpenseRow {
  date: string;
  amount: number;
  expense_categories:
    | { is_vehicle_cost: boolean }
    | { is_vehicle_cost: boolean }[]
    | null;
}

interface RouteRow {
  polyline: string;
  precision: number | null;
}

/**
 * The three sizes one film is built at.
 *
 * Every size in the painter derives from the width, so the three are the
 * same drawing with fewer pixels per frame. The card on the day screen is a
 * third the area of the full-screen preview, and the preview under half the
 * export; on a mid-range Android that is the difference between a smooth
 * film and one that stutters, and the driver judges the feature by what
 * plays first.
 */
const EXPORT = { width: 1080, height: 1920 };
const FULL = { width: 720, height: 1280 };
const CARD = { width: 540, height: 960 };

export interface JourneyFilm {
  /** 1080 by 1920: the file. The size Stories expect and WhatsApp keeps legible. */
  recap: Recap | null;
  /** 720 by 1280, for the full-screen preview. */
  preview: Recap | null;
  /** 540 by 960, for the card inside a scrolling screen. */
  card: Recap | null;
  /** The route as drawn. Empty when there is none. */
  points: LatLng[];
  summary: PeriodSummary | null;
  startedAt: string | null;
  endedAt: string | null;
  loading: boolean;
  /** The journey exists but has not been closed: there is nothing to sum up. */
  unfinished: boolean;
  notFound: boolean;
  reload: () => Promise<void>;
}

export function useJourneyFilm(journeyId: string | null): JourneyFilm {
  const { session, profile } = useSession();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [preview, setPreview] = useState<Recap | null>(null);
  const [card, setCard] = useState<Recap | null>(null);
  const [points, setPoints] = useState<LatLng[]>([]);
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [unfinished, setUnfinished] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const driverName = profile?.preferredName ?? profile?.firstName ?? null;

  const reload = useCallback(async () => {
    if (!session?.user || !journeyId) {
      setLoading(false);
      setNotFound(!journeyId);
      return;
    }

    setLoading(true);

    const [journeyResult, revenueResult, expenseResult, routeResult] = await Promise.all([
      supabase
        .from('journeys')
        .select(
          'id, started_at, ended_at, paused_seconds, odometer_start, odometer_end, distance_override, distance_gps',
        )
        .eq('id', journeyId)
        .maybeSingle(),
      supabase
        .from('revenues')
        .select('date, amount, tips, trip_count, platform_id')
        .eq('journey_id', journeyId),
      supabase
        .from('expenses')
        .select('date, amount, expense_categories(is_vehicle_cost)')
        .eq('journey_id', journeyId),
      supabase.from('journey_routes').select('polyline, precision').eq('journey_id', journeyId).maybeSingle(),
    ]);

    const journey = journeyResult.data as JourneyRow | null;

    if (!journey) {
      setRecap(null);
      setPreview(null);
      setCard(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    setStartedAt(journey.started_at);
    setEndedAt(journey.ended_at);

    if (!journey.ended_at) {
      // Worked time only counts what has closed. A film of an open journey
      // would show a profit that is still going to change.
      setRecap(null);
      setPreview(null);
      setCard(null);
      setUnfinished(true);
      setLoading(false);
      return;
    }

    const totals = summarisePeriod({
      journeys: [
        {
          id: journey.id,
          startedAt: journey.started_at,
          endedAt: journey.ended_at,
          pausedSeconds: journey.paused_seconds,
          odometerStart: journey.odometer_start,
          odometerEnd: journey.odometer_end,
          distanceOverride: journey.distance_override,
          distanceGps: journey.distance_gps,
        },
      ],
      revenues: ((revenueResult.data as RevenueRow[] | null) ?? []).map((row) => ({
        date: row.date,
        amount: row.amount,
        tips: row.tips,
        tripCount: row.trip_count,
        platformId: row.platform_id,
      })),
      expenses: ((expenseResult.data as ExpenseRow[] | null) ?? []).map((row) => {
        // PostgREST returns an embedded one-to-one as an object or, depending
        // on how it reads the relationship, as a one-element array.
        const category = Array.isArray(row.expense_categories)
          ? row.expense_categories[0]
          : row.expense_categories;
        return {
          date: row.date,
          amount: row.amount,
          isVehicleCost: category?.is_vehicle_cost ?? false,
        };
      }),
    });

    let fixes: RawFix[] = [];
    let shown: LatLng[] = [];
    const route = routeResult.data as RouteRow | null;
    if (route?.polyline) {
      shown = decodePolyline(route.polyline, route.precision ?? undefined);
      fixes = fixesFromRoute({
        points: shown,
        startedAt: journey.started_at,
        endedAt: journey.ended_at,
        workedSeconds: totals.workedSeconds,
      });
    }

    const request = {
      id: journey.id,
      summary: totals,
      date: new Date(journey.started_at),
      driverName,
      fixes,
      basemap: filmBasemap(),
      // The film is always dark, so the brand pair is the light theme's,
      // which is the one that reads against a dark ground.
      brand: {
        primary: lightTokens.brandPrimary,
        accent: lightTokens.brandSecondary,
        ink: darkTokens.backgroundPrimary,
      },
    };

    setRecap(buildRecap({ ...request, ...EXPORT }));
    setPreview(buildRecap({ ...request, ...FULL }));
    setCard(buildRecap({ ...request, ...CARD }));
    setPoints(shown);
    setSummary(totals);
    setUnfinished(false);
    setNotFound(false);
    setLoading(false);
  }, [driverName, journeyId, session?.user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    recap,
    preview,
    card,
    points,
    summary,
    startedAt,
    endedAt,
    loading,
    unfinished,
    notFound,
    reload,
  };
}
