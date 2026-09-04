import type { Metres } from '@dinamique/types';
import {
  bearingDegrees,
  bearingDelta,
  boundsOf,
  haversineMetres,
  metresPerWorldUnit,
  simplifyWorld,
  toWorld,
  type WorldBounds,
  type WorldPoint,
} from './geo';
import { decodeOffsets, decodePolyline, type LatLng } from './polyline';

/**
 * Turning what a phone reported into something worth watching.
 *
 * A raw GPS trace is not a route. It contains fixes taken through a
 * windscreen at a traffic light that wander twenty metres in either
 * direction, a fix from a cell tower that puts the driver in the next
 * municipality, and long silences where the app was backgrounded. Drawn
 * literally, that is a scribble with a spike in it, and the spike ruins the
 * camera, because it drags the bounding box across a whole state.
 *
 * Everything here is a pure function of the fixes, so a route that looked
 * wrong on someone's phone can be reproduced from the stored segments in a
 * test.
 */

export interface RawFix {
  lat: number;
  lng: number;
  /** Epoch milliseconds. */
  at: number;
  /** Reported horizontal accuracy in metres, when the platform gives one. */
  accuracy?: number | null;
  /** Metres per second, when the platform gives one. */
  speed?: number | null;
}

export interface TrackPoint extends WorldPoint {
  lat: number;
  lng: number;
  /** Milliseconds since the first kept fix. */
  t: number;
  /** Cumulative metres travelled up to this point. */
  d: Metres;
  /** Smoothed heading in degrees, 0 = north. Drives the camera's rotation. */
  bearing: number;
  /** Metres per second over the leg that ends here. */
  speed: number;
}

export interface RecapTrack {
  points: TrackPoint[];
  /** Metres covered, from the cleaned trace. Never a financial figure (§6). */
  distance: Metres;
  durationMs: number;
  bounds: WorldBounds;
  /** Latitude used to convert world units to metres for this route. */
  centreLatitude: number;
  metresPerWorldUnit: number;
  /** How many raw fixes were discarded, so the app can say so honestly. */
  discardedFixes: number;
}

export interface CleanOptions {
  /**
   * Fixes reported as worse than this are dropped. 50 m is generous, a
   * phone in a cradle under a windscreen routinely reports 20–30 m, but
   * anything beyond it is a cell-tower guess, not a position.
   */
  maxAccuracyMetres?: number;
  /**
   * Implied speed above which a leg is a teleport, not a drive. 55 m/s is
   * ~198 km/h: faster than any legal road in Brazil and slower than the jump
   * a bad fix produces.
   */
  maxSpeedMps?: number;
  /**
   * A driver parked at a rank produces hundreds of fixes inside a ten-metre
   * circle. Below this, a fix is jitter and is folded into the previous one.
   */
  minMoveMetres?: number;
  /** Gaps longer than this are a hole in the trace, not a straight drive. */
  maxGapMs?: number;
}

const DEFAULT_CLEAN: Required<CleanOptions> = {
  maxAccuracyMetres: 50,
  maxSpeedMps: 55,
  minMoveMetres: 6,
  maxGapMs: 5 * 60_000,
};

export interface TrackOptions extends CleanOptions {
  /**
   * Simplification tolerance in metres. 6 m keeps every turn a car can make
   * and discards the wobble between them.
   */
  simplifyMetres?: number;
  /**
   * Upper bound on points handed to the renderer. A canvas re-strokes the
   * whole path every frame; past a couple of thousand points that costs more
   * than it shows, so the tolerance is raised until the path fits.
   */
  maxPoints?: number;
  /**
   * How far ahead the heading looks, in metres. Short windows make the camera
   * twitch at every lane change; long ones make it lazy through a roundabout.
   */
  headingLookaheadMetres?: number;
  /** 0 = no smoothing, 1 = frozen. Applied per point over the heading. */
  headingSmoothing?: number;
}

const DEFAULT_TRACK: Required<Omit<TrackOptions, keyof CleanOptions>> = {
  simplifyMetres: 6,
  maxPoints: 1400,
  headingLookaheadMetres: 45,
  headingSmoothing: 0.82,
};

/** A stored batch, exactly as `journey_track_segments` holds it. */
export interface TrackSegmentRow {
  seq: number;
  startedAt: string;
  polyline: string;
  offsets: string;
}

/**
 * Rebuilds the raw fixes from stored batches.
 *
 * A batch whose offsets and polyline disagree in length is truncated to the
 * shorter of the two rather than dropped: the points that did arrive are
 * real, and a recap missing its last thirty seconds beats no recap.
 */
export function fixesFromSegments(segments: readonly TrackSegmentRow[]): RawFix[] {
  const ordered = [...segments].sort((a, b) => a.seq - b.seq);
  const fixes: RawFix[] = [];

  for (const segment of ordered) {
    const base = Date.parse(segment.startedAt);
    if (!Number.isFinite(base)) continue;

    const points = decodePolyline(segment.polyline);
    const offsets = decodeOffsets(segment.offsets);
    const count = Math.min(points.length, offsets.length);

    for (let i = 0; i < count; i += 1) {
      const point = points[i]!;
      fixes.push({ lat: point.lat, lng: point.lng, at: base + offsets[i]! });
    }
  }

  return fixes;
}

/**
 * A route as the app stores it today: the drawing, without the clock.
 *
 * `journey_routes` keeps one simplified polyline per journey and no timestamps
 * (see packages/database, 20260821000200). The film still needs a time for
 * every vertex, because the head moves along the line at the pace the day was
 * driven and the HUD clock counts up beside it. What is known is when the
 * journey started and ended, so the clock is spread over the route in
 * proportion to distance: the driver is assumed to have moved at one steady
 * pace between the two. That is a simplification, and an honest one: the
 * kilometres are real and the total time is real, only the pace inside the
 * shift is smoothed.
 *
 * A shift with no end, or one whose clock disagrees with its kilometres to the
 * point of implying flight, gets a pace of a fast road instead, so the
 * cleaning pass never throws the whole route away over a bad timestamp.
 */
export interface StoredRoute {
  /** Decoded vertices, in the order they were driven. `lon` as the app names it. */
  points: readonly { lat: number; lon: number }[];
  /** ISO timestamp, when the journey started. */
  startedAt: string;
  /** ISO timestamp, when it ended. Null while it is still open. */
  endedAt?: string | null;
  /**
   * Time actually worked, in seconds, when the caller knows it. Preferred over
   * the wall-clock span between start and end: a shift paused for half an hour
   * should not have the HUD clock counting through the pause, because the
   * finale card shows worked time and the two must agree.
   */
  workedSeconds?: number | null;
}

/** Fastest average the synthetic clock will admit, in metres per second. */
const MAX_SYNTHETIC_PACE_MPS = 25;
/** The pace assumed when a journey has no usable end time. */
const FALLBACK_PACE_MPS = 8;

export function fixesFromRoute(route: StoredRoute): RawFix[] {
  const points = route.points.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lon),
  );
  if (points.length === 0) return [];

  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMetres(
      { lat: points[i - 1]!.lat, lng: points[i - 1]!.lon },
      { lat: points[i]!.lat, lng: points[i]!.lon },
    );
    cumulative.push(total);
  }

  const start = Date.parse(route.startedAt);
  const base = Number.isFinite(start) ? start : 0;
  const end = route.endedAt ? Date.parse(route.endedAt) : Number.NaN;

  const worked = route.workedSeconds ?? null;
  let spanMs =
    worked !== null && Number.isFinite(worked) && worked > 0
      ? worked * 1000
      : Number.isFinite(end)
        ? end - base
        : Number.NaN;
  if (!Number.isFinite(spanMs) || spanMs <= 0) spanMs = (total / FALLBACK_PACE_MPS) * 1000;
  spanMs = Math.max(spanMs, (total / MAX_SYNTHETIC_PACE_MPS) * 1000, 1000);

  return points.map((point, index) => ({
    lat: point.lat,
    lng: point.lon,
    at: base + (total > 0 ? Math.round((cumulative[index]! / total) * spanMs) : index),
  }));
}

/** Splits a run of fixes into the batches the device stores. */
export function toSegmentPayload(fixes: readonly RawFix[]): {
  startedAt: string;
  offsetsMs: number[];
  points: LatLng[];
  distance: Metres;
} | null {
  if (fixes.length === 0) return null;
  const ordered = [...fixes].sort((a, b) => a.at - b.at);
  const base = ordered[0]!.at;

  let distance = 0;
  for (let i = 1; i < ordered.length; i += 1) {
    distance += haversineMetres(ordered[i - 1]!, ordered[i]!);
  }

  return {
    startedAt: new Date(base).toISOString(),
    offsetsMs: ordered.map((fix) => fix.at - base),
    points: ordered.map((fix) => ({ lat: fix.lat, lng: fix.lng })),
    distance,
  };
}

/**
 * Drops what cannot be true. Returns the survivors in time order.
 *
 * Order matters: accuracy first (a bad fix should never anchor the speed
 * check), then jitter, then teleports. A teleport is measured against the
 * last *kept* fix, so two consecutive bad fixes cannot conspire to look like
 * a plausible leg.
 */
export function cleanFixes(
  fixes: readonly RawFix[],
  options: CleanOptions = {},
): { kept: RawFix[]; discarded: number } {
  const config = { ...DEFAULT_CLEAN, ...options };
  const ordered = [...fixes]
    .filter(
      (fix) =>
        Number.isFinite(fix.lat) &&
        Number.isFinite(fix.lng) &&
        Number.isFinite(fix.at) &&
        Math.abs(fix.lat) <= 90 &&
        Math.abs(fix.lng) <= 180,
    )
    .sort((a, b) => a.at - b.at);

  const kept: RawFix[] = [];
  let discarded = fixes.length - ordered.length;

  for (const fix of ordered) {
    if (fix.accuracy != null && fix.accuracy > config.maxAccuracyMetres) {
      discarded += 1;
      continue;
    }

    const previous = kept[kept.length - 1];
    if (!previous) {
      kept.push(fix);
      continue;
    }

    const elapsedMs = fix.at - previous.at;
    if (elapsedMs <= 0) {
      discarded += 1;
      continue;
    }

    const moved = haversineMetres(previous, fix);

    if (moved < config.minMoveMetres) {
      discarded += 1;
      continue;
    }

    // A long silence is a hole, not a sprint: keep the fix, but do not judge
    // it on an implied speed computed across a gap the app was asleep for.
    if (elapsedMs <= config.maxGapMs) {
      const impliedSpeed = moved / (elapsedMs / 1000);
      if (impliedSpeed > config.maxSpeedMps) {
        discarded += 1;
        continue;
      }
    }

    kept.push(fix);
  }

  return { kept, discarded };
}

/**
 * The one entry point: raw fixes in, a drawable track out.
 *
 * Returns null when there is nothing worth animating, fewer than two
 * surviving fixes, or a "route" shorter than a city block. A recap of a
 * hundred-metre scribble is worse than no map at all, and the storyboard has
 * a mapless variant for exactly that case.
 */
export function buildTrack(
  fixes: readonly RawFix[],
  options: TrackOptions = {},
): RecapTrack | null {
  const config = { ...DEFAULT_CLEAN, ...DEFAULT_TRACK, ...options };
  const { kept, discarded } = cleanFixes(fixes, config);
  if (kept.length < 2) return null;

  const start = kept[0]!.at;
  const centreLatitude = kept[Math.floor(kept.length / 2)]!.lat;
  const scale = metresPerWorldUnit(centreLatitude);

  // Simplify in world space, but carry the timestamps: a point that survives
  // simplification keeps its own time, which is what lets the head move at
  // the speed the driver actually drove instead of a constant crawl.
  const world = kept.map((fix) => ({ ...toWorld(fix), at: fix.at, lat: fix.lat, lng: fix.lng }));
  let simplified = simplifyByTolerance(world, config.simplifyMetres / scale);

  // Back off until the path is cheap enough to stroke sixty times a second.
  let tolerance = config.simplifyMetres;
  while (simplified.length > config.maxPoints && tolerance < 500) {
    tolerance *= 1.8;
    simplified = simplifyByTolerance(world, tolerance / scale);
  }

  if (simplified.length < 2) return null;

  const points: TrackPoint[] = [];
  let distance = 0;

  for (let i = 0; i < simplified.length; i += 1) {
    const current = simplified[i]!;
    const previous = simplified[i - 1];
    let speed = 0;

    if (previous) {
      const leg = haversineMetres(previous, current);
      distance += leg;
      const seconds = Math.max(0.001, (current.at - previous.at) / 1000);
      speed = leg / seconds;
    }

    points.push({
      x: current.x,
      y: current.y,
      lat: current.lat,
      lng: current.lng,
      t: current.at - start,
      d: distance,
      bearing: 0,
      speed,
    });
  }

  if (distance < 150) return null;

  applyHeadings(points, config.headingLookaheadMetres, config.headingSmoothing);

  const bounds = boundsOf(points);
  if (!bounds) return null;

  return {
    points,
    distance,
    durationMs: points[points.length - 1]!.t,
    bounds,
    centreLatitude,
    metresPerWorldUnit: scale,
    discardedFixes: discarded,
  };
}

interface TimedWorldPoint extends WorldPoint {
  at: number;
  lat: number;
  lng: number;
}

function simplifyByTolerance(
  points: readonly TimedWorldPoint[],
  toleranceWorld: number,
): TimedWorldPoint[] {
  const simplified = simplifyWorld(points, toleranceWorld);
  // simplifyWorld preserves identity of the objects it keeps, so the times
  // ride along for free.
  return simplified as TimedWorldPoint[];
}

/**
 * Heading, looking forward rather than backward.
 *
 * A camera pointed at where the driver *was* arrives at every corner late and
 * swings through it, which is the single most nauseating thing a follow-cam
 * does. Looking ~45 m ahead means the frame has already begun to turn as the
 * car does. The exponential smoothing that follows is applied on the shortest
 * angular path, so 350° → 10° crosses zero instead of unwinding the long way
 * round.
 */
function applyHeadings(points: TrackPoint[], lookaheadMetres: number, smoothing: number): void {
  const raw = new Array<number>(points.length);

  for (let i = 0; i < points.length; i += 1) {
    const from = points[i]!;
    let target = points[points.length - 1]!;
    for (let j = i + 1; j < points.length; j += 1) {
      target = points[j]!;
      if (target.d - from.d >= lookaheadMetres) break;
    }
    raw[i] =
      target === from ? (raw[i - 1] ?? 0) : bearingDegrees(from, target);
  }

  let smoothed = raw[0] ?? 0;
  for (let i = 0; i < points.length; i += 1) {
    smoothed = (smoothed + bearingDelta(smoothed, raw[i]!) * (1 - smoothing) + 360) % 360;
    points[i]!.bearing = smoothed;
  }

  // A second pass backwards cancels the lag the first one introduces, so the
  // camera is centred on the turn rather than trailing it.
  let reverse = points[points.length - 1]!.bearing;
  for (let i = points.length - 1; i >= 0; i -= 1) {
    reverse = (reverse + bearingDelta(reverse, points[i]!.bearing) * (1 - smoothing) + 360) % 360;
    points[i]!.bearing = reverse;
  }
}

/**
 * Position, heading and counters at an arbitrary distance along the track.
 * Interpolated, because the head moves continuously while the points are
 * whatever the GPS happened to report.
 */
export function sampleTrackAtDistance(
  track: RecapTrack,
  metres: Metres,
): { point: WorldPoint; bearing: number; index: number; elapsedMs: number; distance: Metres } {
  const points = track.points;
  const target = Math.min(Math.max(metres, 0), track.distance);

  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (points[mid]!.d < target) low = mid + 1;
    else high = mid;
  }

  const index = Math.max(1, low);
  const a = points[index - 1]!;
  const b = points[index]!;
  const span = b.d - a.d;
  const ratio = span <= 0 ? 0 : (target - a.d) / span;

  return {
    point: { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio },
    bearing: (a.bearing + bearingDelta(a.bearing, b.bearing) * ratio + 360) % 360,
    index,
    elapsedMs: a.t + (b.t - a.t) * ratio,
    distance: target,
  };
}
