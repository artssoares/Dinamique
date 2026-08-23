import type { LatLng } from '@dinamique/types';

/**
 * Turning a track into something drawable.
 *
 * Shared by the in-app replay and the story card, which is why it lives here
 * rather than in the app: both render the same shape, and two implementations
 * of "where does this line go" would eventually disagree about the same day.
 *
 * The projection is equirectangular, anchored on the track's own middle
 * latitude. Over a day's driving that is visually indistinguishable from
 * anything more careful, and it costs one cosine — whereas plotting raw
 * degrees would stretch every route east-to-west by a factor of cos(lat),
 * which in São Paulo is about 8%. Enough to make a familiar neighbourhood
 * look wrong.
 */

const DEG_TO_RAD = Math.PI / 180;

export interface Bounds {
  /** North-east corner, as MapLibre wants it: [lon, lat]. */
  ne: [number, number];
  /** South-west corner. */
  sw: [number, number];
}

export interface TracePath {
  /** SVG path data for the whole route. */
  d: string;
  /** Length of the path in viewBox units — computed, not measured. */
  length: number;
  /** Projected points, so a caller can place markers without reprojecting. */
  points: Array<{ x: number; y: number }>;
  /** Cumulative length at each point, for revealing the line progressively. */
  lengths: number[];
}

export function bounds(points: readonly LatLng[]): Bounds | null {
  if (points.length === 0) return null;

  let north = points[0]!.lat;
  let south = points[0]!.lat;
  let east = points[0]!.lon;
  let west = points[0]!.lon;

  for (const point of points) {
    if (point.lat > north) north = point.lat;
    if (point.lat < south) south = point.lat;
    if (point.lon > east) east = point.lon;
    if (point.lon < west) west = point.lon;
  }

  return { ne: [east, north], sw: [west, south] };
}

/**
 * Zoom used when a route has no extent of its own — roughly a couple of
 * blocks, which is what makes "I was here" readable as a place rather than as
 * a rooftop.
 */
export const STANDSTILL_ZOOM = 16;

/**
 * Below this span, in degrees, a box is a dot.
 *
 * Roughly ten metres of latitude. A driver who stayed put still produces
 * fixes a few metres apart, so a strict equality test would miss almost every
 * real standstill and hand the camera a box it can only answer by zooming to
 * the maximum — a blurry patch of roof, with no street in it.
 */
const DEGENERATE_SPAN_DEG = 0.0001;

export type RouteCamera =
  | { kind: 'bounds'; bounds: Bounds }
  | { kind: 'centre'; centre: [number, number]; zoom: number };

/**
 * What to point the camera at, for a route of any size including one point.
 *
 * Both replays ask this rather than calling `fitBounds` on whatever `bounds`
 * returned: fitting a zero-area box is a division nobody defined, and every
 * map library answers it differently and badly.
 */
export function cameraFor(points: readonly LatLng[]): RouteCamera | null {
  const box = bounds(points);
  if (!box) return null;

  const spanLon = box.ne[0] - box.sw[0];
  const spanLat = box.ne[1] - box.sw[1];

  if (spanLon < DEGENERATE_SPAN_DEG && spanLat < DEGENERATE_SPAN_DEG) {
    return {
      kind: 'centre',
      centre: [(box.ne[0] + box.sw[0]) / 2, (box.ne[1] + box.sw[1]) / 2],
      zoom: STANDSTILL_ZOOM,
    };
  }

  return { kind: 'bounds', bounds: box };
}

/**
 * Fits a track into a box, preserving its shape.
 *
 * A route squeezed to fill the box would be a different route: a straight run
 * up an avenue would come out as a diagonal. So one scale is used for both
 * axes and the leftover space becomes centring, not stretch.
 */
export function traceTo(
  points: readonly LatLng[],
  width: number,
  height: number,
  padding = 0,
): TracePath | null {
  if (points.length < 1 || width <= 0 || height <= 0) return null;

  const box = bounds(points);
  if (!box) return null;

  // A standstill is one point and no line. Centred rather than projected,
  // because a box with no extent has no meaningful scale — and the caller
  // draws a marker for it, so returning null would be a blank panel where
  // the driver expects to see where they were.
  if (points.length === 1) {
    const centre = { x: width / 2, y: height / 2 };
    return { d: `M${round(centre.x)} ${round(centre.y)}`, length: 0, points: [centre], lengths: [0] };
  }

  const [east, north] = box.ne;
  const [west, south] = box.sw;

  const midLat = (north + south) / 2;
  const lonScale = Math.cos(midLat * DEG_TO_RAD);

  // Flip y: latitude grows northwards, screen coordinates grow downwards.
  const flat = points.map((point) => ({
    x: (point.lon - west) * lonScale,
    y: north - point.lat,
  }));

  const spanX = (east - west) * lonScale;
  const spanY = north - south;

  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);

  // A route straight along one axis has zero span on the other; guard both so
  // the scale never becomes Infinity.
  const scale = Math.min(
    spanX > 0 ? innerWidth / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? innerHeight / spanY : Number.POSITIVE_INFINITY,
  );
  const safeScale = Number.isFinite(scale) ? scale : 1;

  const offsetX = padding + (innerWidth - spanX * safeScale) / 2;
  const offsetY = padding + (innerHeight - spanY * safeScale) / 2;

  const projected = flat.map((point) => ({
    x: offsetX + point.x * safeScale,
    y: offsetY + point.y * safeScale,
  }));

  const lengths: number[] = [0];
  let total = 0;
  for (let i = 1; i < projected.length; i += 1) {
    total += Math.hypot(
      projected[i]!.x - projected[i - 1]!.x,
      projected[i]!.y - projected[i - 1]!.y,
    );
    lengths.push(total);
  }

  const d = projected
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ');

  return { d, length: total, points: projected, lengths };
}

/**
 * The path length is computed here rather than read from the rendered node.
 *
 * `getTotalLength()` on a ref is exact for curves, but this is a polyline —
 * the sum of the segments *is* the length, to the last decimal. Computing it
 * removes a ref, a timing dependency and a platform difference all at once.
 */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
