import type { LatLng, Metres, Seconds } from '@dinamique/types';
import { KM } from '@dinamique/utils';

/**
 * Turning a stream of GPS fixes into a distance a driver would agree with.
 *
 * A phone in a cupholder does not report where the car is; it reports where the
 * receiver currently believes the car is, and that belief is wrong in three
 * specific ways. It is vague under a viaduct, it teleports when it reacquires,
 * and it wanders while the car is parked. Summing raw fixes therefore always
 * overstates the shift — which is the worst possible failure here, because an
 * inflated denominator makes R$/km look better than it is.
 *
 * Every threshold below is a deliberate refusal to believe something, and the
 * null-not-zero doctrine (PRODUCT_RULES.md §6) applies: a track we cannot trust
 * yields `null`, never a small wrong number.
 */

/** Fixes vaguer than this are noise, not position. */
export const MAX_ACCEPTABLE_ACCURACY_M = 50;

/** No car working a Brazilian shift sustains more than this between fixes. */
export const MAX_PLAUSIBLE_SPEED_KMH = 180;

/** Below this the car is parked and the receiver is drifting. */
export const STATIONARY_THRESHOLD_M = 15;

/** Douglas–Peucker tolerance for the stored line. */
export const ROUTE_SIMPLIFY_TOLERANCE_M = 12;

/**
 * Hard ceiling on stored points. This is a storage decision as much as a
 * rendering one — see DATABASE.md on `journey_routes`. Roughly 7 KB encoded.
 */
export const MAX_STORED_ROUTE_POINTS = 1000;

/** Below this many usable fixes we refuse to claim a GPS distance at all. */
export const MIN_FIXES_FOR_GPS_DISTANCE = 10;

/** Below this total the track is indistinguishable from parked drift. */
export const MIN_GPS_DISTANCE_M = 200;

/**
 * Metres shaved off each end of a route before it leaves the device as an
 * image. A shared trace that starts at a driver's front door is an address
 * leak, and a story card outlives the person who posted it.
 */
export const SHARED_ROUTE_TRIM_M = 500;

/**
 * The trim never eats more than this share of a route from either end.
 *
 * A flat 500 m off each end of a 3 km shift would be a third of it, and a
 * driver sharing a short day deserves a line that still looks like where they
 * went. The settings copy says "até 500 metros" for this reason.
 */
export const MAX_TRIM_SHARE = 0.1;

/**
 * A route needs an interior to survive having both ends removed. Two points
 * are two ends, so there is nothing left over to draw.
 */
export const MIN_POINTS_TO_TRIM = 3;

/**
 * The smallest radius the trim is willing to call privacy.
 *
 * `MAX_TRIM_SHARE` is a cap, not a floor, and read alone it produces a trim
 * that shrinks with the route: a tenth of 300 m is thirty metres, which hides
 * a doorstep and nothing else. So the budget is at least this, whatever the
 * proportional figure works out to, and a route that cannot give up this much
 * from each end and still leave a line is not published at all.
 *
 * A hundred and fifty metres is a block or two in a Brazilian city: enough
 * that the picture starts somewhere on the driver's street rather than at
 * their gate.
 */
export const MIN_TRIM_M = 150;

/**
 * A gap longer than this between two accepted fixes is a stop, not movement —
 * the driver was waiting for a ride, not covering ground slowly.
 */
export const MAX_MOVING_SEGMENT_S = 120;

/** IUGG mean Earth radius. */
export const EARTH_RADIUS_M = 6_371_008.8;

/** One raw reading as the device reported it. */
export interface Fix {
  /** Epoch milliseconds. */
  t: number;
  lat: number;
  lon: number;
  /** Reported horizontal accuracy in metres; larger is worse. */
  acc: number;
  /** Reported ground speed in m/s, when the device offered one. */
  spd: number | null;
}

export interface TrackSummary {
  /** null when the track is not trustworthy — never zero. */
  distance: Metres | null;
  /** Points actually stored, after simplification and the budget. */
  points: LatLng[];
  pointCount: number;
  /** How many raw fixes we refused to believe. Useful for a bad shift. */
  droppedFixes: number;
  /** Time spent actually covering ground, long stops excluded. */
  movingSeconds: Seconds;
}

const DEG_TO_RAD = Math.PI / 180;

/** Great-circle distance between two coordinates, in whole metres. */
export function haversineMetres(a: LatLng, b: LatLng): Metres {
  const latA = a.lat * DEG_TO_RAD;
  const latB = b.lat * DEG_TO_RAD;
  const dLat = latB - latA;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;

  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/**
 * Whether a single fix is believable, given the last one we accepted.
 *
 * Split out because the live counter on the journey card applies exactly this,
 * one fix at a time, as they arrive — and a second implementation would drift
 * from the figure the shift is finally saved with.
 *
 * Drops the fixes we do not believe, in this order:
 *
 *  1. anything vaguer than `MAX_ACCEPTABLE_ACCURACY_M`;
 *  2. anything implying an impossible speed **from the last accepted fix** —
 *     comparing against the previous raw fix instead would let one bad reading
 *     poison the comparison that follows it;
 *  3. anything within `STATIONARY_THRESHOLD_M` of the last accepted fix, which
 *     is what stops twenty parked minutes from becoming four hundred metres.
 */
export function acceptFix(last: Fix | null, fix: Fix): boolean {
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return false;
  // `Number.isFinite` first: a fix whose accuracy round-tripped through JSON
  // as null would otherwise slip past `<= 50` and be believed, which is how a
  // live figure and a saved one drift apart.
  if (!Number.isFinite(fix.acc) || fix.acc > MAX_ACCEPTABLE_ACCURACY_M) return false;
  if (!last) return true;

  const moved = haversineMetres(last, fix);
  const elapsedSeconds = (fix.t - last.t) / 1000;

  if (elapsedSeconds > 0) {
    if ((moved / elapsedSeconds) * 3.6 > MAX_PLAUSIBLE_SPEED_KMH) return false;
  } else if (moved > STATIONARY_THRESHOLD_M) {
    // Two positions at the same instant cannot both be true.
    return false;
  }

  return moved >= STATIONARY_THRESHOLD_M;
}

/** The believable fixes, in order. The first acceptable one is always kept. */
export function filterFixes(fixes: readonly Fix[]): Fix[] {
  const accepted: Fix[] = [];
  for (const fix of fixes) {
    if (acceptFix(accepted[accepted.length - 1] ?? null, fix)) accepted.push(fix);
  }
  return accepted;
}

/** Total ground covered by an already-filtered track. */
export function trackDistance(points: readonly LatLng[]): Metres {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversineMetres(points[i - 1]!, points[i]!);
  }
  return total;
}

/**
 * Distance covered by a filtered track, ignoring the jumps across gaps.
 *
 * Capture stops and starts: a pause, a reboot, a tunnel, a settings toggle.
 * The two fixes either side of one of those are minutes or hours apart, and
 * the straight line between them is not ground the driver covered under this
 * journey's clock — it is the drive to lunch, or a stretch nobody recorded.
 * Adding it inflates the denominator of every per-km figure, which is the one
 * direction this must never fail in.
 */
export function trackDistanceExcludingGaps(
  fixes: readonly Fix[],
  /**
   * Instants at which capture restarted, as the device recorded them.
   *
   * The two-minute rule catches a gap by its length, which misses a short
   * deliberate stop — ninety seconds is long enough to drive to lunch and
   * nowhere near two minutes. The device knows exactly when it stopped and
   * started, so it says so rather than leaving the length to guess.
   */
  breaks: readonly number[] = [],
): Metres {
  let total = 0;
  for (let i = 1; i < fixes.length; i += 1) {
    const previous = fixes[i - 1]!;
    const fix = fixes[i]!;
    if ((fix.t - previous.t) / 1000 > MAX_MOVING_SEGMENT_S) continue;
    if (breaks.some((at) => at > previous.t && at <= fix.t)) continue;
    total += haversineMetres(previous, fix);
  }
  return total;
}

/**
 * Projects to a local plane so tolerances can be stated in metres.
 *
 * A degree of longitude is not a degree of latitude anywhere but the equator,
 * so running Douglas–Peucker on raw degrees would simplify east–west travel
 * far more aggressively than north–south. Anchoring on a reference latitude
 * costs one cosine and makes the tolerance mean what it says.
 */
function project(point: LatLng, referenceLat: number): { x: number; y: number } {
  return {
    x: point.lon * DEG_TO_RAD * Math.cos(referenceLat * DEG_TO_RAD) * EARTH_RADIUS_M,
    y: point.lat * DEG_TO_RAD * EARTH_RADIUS_M,
  };
}

function perpendicularDistance(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const numerator = Math.abs(dy * point.x - dx * point.y + end.x * start.y - end.y * start.x);
  return numerator / Math.hypot(dx, dy);
}

/** Ramer–Douglas–Peucker, with the tolerance in metres. */
export function simplifyTrack(
  points: readonly LatLng[],
  toleranceM: number = ROUTE_SIMPLIFY_TOLERANCE_M,
): LatLng[] {
  if (points.length <= 2 || toleranceM <= 0) return [...points];

  const referenceLat = points[0]!.lat;
  const flat = points.map((p) => project(p, referenceLat));

  // Iterative rather than recursive: a 10-hour shift can produce enough points
  // to blow a JS stack, and a driver's day should not depend on that.
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let furthest = -1;
    let furthestDistance = 0;

    for (let i = first + 1; i < last; i += 1) {
      const distance = perpendicularDistance(flat[i]!, flat[first]!, flat[last]!);
      if (distance > furthestDistance) {
        furthestDistance = distance;
        furthest = i;
      }
    }

    if (furthest !== -1 && furthestDistance > toleranceM) {
      keep[furthest] = true;
      stack.push([first, furthest], [furthest, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

/**
 * Raises the tolerance until the track fits the storage budget.
 *
 * Doubling converges in a handful of passes even for a pathological track, and
 * the thinning below is the guarantee: whatever the geometry, the ceiling holds.
 */
export function fitToPointBudget(
  points: readonly LatLng[],
  maxPoints: number = MAX_STORED_ROUTE_POINTS,
): LatLng[] {
  if (points.length <= maxPoints) return [...points];

  let tolerance = ROUTE_SIMPLIFY_TOLERANCE_M;
  let simplified = simplifyTrack(points, tolerance);

  while (simplified.length > maxPoints && tolerance < KM) {
    tolerance *= 2;
    simplified = simplifyTrack(points, tolerance);
  }

  if (simplified.length <= maxPoints) return simplified;

  // Last resort, and it thins rather than truncates. Slicing off the tail
  // would end the drawn route mid-shift — and `trimRouteEnds` would then hide
  // a fabricated endpoint instead of the real one, which is worse than useless
  // for a picture the driver posts.
  const step = simplified.length / maxPoints;
  const thinned: LatLng[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    thinned.push(simplified[Math.floor(i * step)]!);
  }
  // The true end matters: it is what the trim is measured back from.
  thinned[thinned.length - 1] = simplified[simplified.length - 1]!;
  return thinned;
}

/**
 * Removes the first and last stretch of a route before it is shown to anyone
 * but the driver.
 *
 * The budget per end is `MAX_TRIM_SHARE` of the total, never more than
 * `SHARED_ROUTE_TRIM_M` and never less than `MIN_TRIM_M`. Both bounds matter,
 * and they used to be read as one rule with the wrong shape.
 *
 * The old version refused any route whose proportional trim came out under
 * `MIN_TRIM_M`, which meant everything below about 1.5 km came back empty and
 * the driver was told their day was "curto demais para compartilhar". A short
 * shift is still a shift, and a privacy rule whose visible effect is that the
 * feature does not work is not protecting anybody.
 *
 * The answer is not to shrink the radius on a short route, though, which is
 * where this landed on the first pass: a tenth of 300 m is thirty metres, and
 * a picture starting thirty metres from someone's gate is their address. So
 * the minimum *raises* the budget instead of refusing the route. A 1 km shift
 * now gives up 150 m from each end and keeps 700 m of line, where before it
 * was refused outright. What still comes back empty is the route that never
 * gets `MIN_TRIM_M` away from where it began, and that one is not a trip
 * across town, it is the driver's own neighbourhood.
 */
export function trimRouteEnds(
  points: readonly LatLng[],
  trimM: number = SHARED_ROUTE_TRIM_M,
): LatLng[] {
  if (trimM <= 0) return [...points];
  // Two points are two ends. Removing both leaves nothing, and publishing
  // either is the one thing this exists to stop.
  if (points.length < MIN_POINTS_TO_TRIM) return [];

  const last = points.length - 1;
  const total = trackDistance(points);
  // A pile of readings in one place is a parked car, not a route. There is no
  // shape in it to publish, only an address.
  if (total <= 0) return [];

  // The floor is applied before the ceiling, so a short route asks for more
  // than its proportional share rather than settling for a token trim, and a
  // long one is still capped at the 500 m the settings screen promises.
  const budget = Math.min(trimM, Math.max(total * MAX_TRIM_SHARE, MIN_TRIM_M));

  // Two conditions, and both have to hold. Walking the path alone is not
  // enough: a shift that opens with a loop around the block covers the whole
  // budget in metres travelled and still finishes fifty metres from the
  // driver's front door. What has to be hidden is the *displacement* from the
  // original point, so the walk continues until the straight-line distance
  // clears the budget too.
  let start = 0;
  let walked = 0;
  while (
    start < last &&
    (walked < budget || haversineMetres(points[0]!, points[start]!) < budget)
  ) {
    walked += haversineMetres(points[start]!, points[start + 1]!);
    start += 1;
  }

  let end = last;
  walked = 0;
  while (
    end > 0 &&
    (walked < budget || haversineMetres(points[last]!, points[end]!) < budget)
  ) {
    walked += haversineMetres(points[end]!, points[end - 1]!);
    end -= 1;
  }

  // Belt and braces on top of the walks: the true endpoints never survive into
  // the slice even if a degenerate geometry let a walk stop on step zero.
  start = Math.max(start, 1);
  end = Math.min(end, last - 1);

  // The walks crossed, which means the route never gets `budget` away from
  // where it started: a few blocks circled, a short errand, an afternoon
  // inside one neighbourhood. There is no part of it far enough from home to
  // publish, so nothing is. Keeping the middle here, which is what the first
  // pass did, would post a point inside the very radius this is hiding.
  if (start > end || end - start + 1 < 2) return [];

  return points.slice(start, end + 1);
}

/**
 * The one call the app makes. Everything above is exported for its tests.
 *
 * Returns `distance: null` — never zero — when the track is too thin or too
 * short to be a day's driving, so the caller falls through to whatever the
 * driver typed instead of publishing a number nobody would recognise. `points`
 * is not held to that bar: it is a picture of where the phone was, not a
 * denominator, and it is returned whenever a single fix was believable.
 */
export function summariseTrack(
  fixes: readonly Fix[],
  breaks: readonly number[] = [],
): TrackSummary {
  const accepted = filterFixes(fixes);
  const droppedFixes = fixes.length - accepted.length;

  if (accepted.length === 0) {
    return { distance: null, points: [], pointCount: 0, droppedFixes, movingSeconds: 0 };
  }

  // The drawing and the figure are two different promises, and only one of them
  // is financial. `distance` feeds R$/km, so it stays behind both minimums: a
  // handful of fixes is not a shift, and a number nobody would recognise is
  // worse than no number at all. The shape is just where the phone was, and a
  // driver who opened a journey outside their building and closed it there
  // should still see that spot on a map instead of a blank panel. So the points
  // survive on any accepted fix, including exactly one.
  const belowMinimumFixes = accepted.length < MIN_FIXES_FOR_GPS_DISTANCE;
  const distance = belowMinimumFixes ? 0 : trackDistanceExcludingGaps(accepted, breaks);

  let movingSeconds = 0;
  for (let i = 1; i < accepted.length; i += 1) {
    const gap = (accepted[i]!.t - accepted[i - 1]!.t) / 1000;
    if (gap > 0) movingSeconds += Math.min(gap, MAX_MOVING_SEGMENT_S);
  }

  // Strip the diagnostic fields before the track is stored or drawn: a
  // simplified route is a shape, and timestamps riding along in it would be
  // a second, undeclared copy of the driver's movements.
  //
  // The shape keeps every accepted fix, including the pair either side of a
  // break, so the drawn line runs straight across it while the distance above
  // deliberately does not count that stretch. That is the same convention
  // every tracking app uses for a signal gap, and the alternative — a
  // multi-segment geometry — would have to be threaded through the map layer,
  // the SVG trace and the story card to change one cosmetic detail.
  const shape: LatLng[] = accepted.map((fix) => ({ lat: fix.lat, lon: fix.lon }));
  const points = fitToPointBudget(simplifyTrack(shape));

  return {
    distance: belowMinimumFixes || distance < MIN_GPS_DISTANCE_M ? null : distance,
    points,
    pointCount: points.length,
    droppedFixes,
    movingSeconds: Math.round(movingSeconds),
  };
}
