import type { PeriodSummary } from '@dinamique/business-logic';
import { buildFilm, type FilmOptions, type RecapFilm } from './film';
import { renderRecapDocument, type RenderOptions } from './renderer';
import {
  buildRecapStats,
  DEFAULT_BRAND,
  TILELESS_BASEMAP,
  type RecapBasemap,
  type RecapBrand,
  type RecapScene,
} from './scene';
import type { Storyboard } from './storyboard';
import {
  buildTrack,
  fixesFromSegments,
  type RawFix,
  type TrackOptions,
  type TrackSegmentRow,
} from './track';

export * from './easing';
export * from './film';
export * from './geo';
export * from './polyline';
export * from './renderer';
export * from './scene';
export * from './storyboard';
export * from './track';
export { PAINTER_SOURCE } from './painter';

/**
 * @dinamique/recap, the journey recap film.
 *
 * One package, three layers, deliberately not mixed:
 *
 *   geo + track      what happened, cleaned up
 *   storyboard + film   how the camera moves through it, precomputed
 *   painter + renderer  what it looks like, as a self-contained document
 *
 * Nothing here touches Supabase, React or React Native. The app fetches rows
 * and hands them in; what comes back is an HTML string and the numbers that
 * describe it, which is why the whole choreography can be tested without a
 * canvas and rendered identically on a phone and in a browser.
 */

export interface RecapRequest {
  id: string;
  /** The journey's own totals, always from summarisePeriod, never re-derived. */
  summary: PeriodSummary;
  /** The journey's date, for the opening card. */
  date: Date;
  driverName?: string | null;
  /**
   * The route, already as timed fixes. This is what the app passes: it reads
   * `journey_routes` and runs the polyline through `fixesFromRoute`. Empty
   * or absent produces the mapless variant.
   */
  fixes?: readonly RawFix[];
  /** Stored route batches, the older shape. Used only when `fixes` is absent. */
  segments?: readonly TrackSegmentRow[];
  basemap?: RecapBasemap;
  brand?: Partial<RecapBrand>;
  /** 1080×1920 for export; a smaller pair for a preview on a slow device. */
  width?: number;
  height?: number;
  track?: TrackOptions;
  film?: FilmOptions;
}

export interface Recap {
  scene: RecapScene;
  film: RecapFilm;
  storyboard: Storyboard;
  /** True when a route survived cleaning and the map variant is in use. */
  hasRoute: boolean;
  /** The complete, self-contained page. */
  document: (options?: RenderOptions) => string;
}

/**
 * Everything the app needs, from rows to a playable document.
 *
 * A journey with no usable route is not an error and does not throw: it
 * produces the mapless variant. Route capture is opt-in, most journeys in the
 * first weeks will have no trace at all, and a share button that only works
 * for people who granted a location permission is a share button nobody
 * discovers.
 */
export function buildRecap(request: RecapRequest): Recap {
  const fixes = request.fixes?.length
    ? request.fixes
    : request.segments?.length
      ? fixesFromSegments(request.segments)
      : [];
  const track = fixes.length ? buildTrack(fixes, request.track ?? {}) : null;

  const scene: RecapScene = {
    id: request.id,
    stats: buildRecapStats({
      summary: request.summary,
      date: request.date,
      driverName: request.driverName ?? null,
    }),
    track,
    basemap: request.basemap ?? TILELESS_BASEMAP,
    brand: { ...DEFAULT_BRAND, ...request.brand },
    width: request.width ?? 1080,
    height: request.height ?? 1920,
  };

  const { film, storyboard } = buildFilm(scene, request.film ?? {});

  return {
    scene,
    film,
    storyboard,
    hasRoute: track !== null,
    document: (options) => renderRecapDocument(scene, film, options),
  };
}
