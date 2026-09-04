import type { Metres } from '@dinamique/types';
import type { LatLng } from './polyline';

/**
 * Web Mercator, plus the two operations a recap actually needs: how far apart
 * two fixes are, and how to throw away the points that do not change the
 * shape of a line.
 *
 * World coordinates are normalised to 0..1 rather than pixels at a zoom level.
 * That keeps the camera's maths independent of the output resolution, the
 * same storyboard renders a 720×1280 preview and a 1080×1920 export without a
 * single number changing.
 */

export interface WorldPoint {
  /** 0 at 180°W, 1 at 180°E. */
  x: number;
  /** 0 at the north edge of the projection, 1 at the south. */
  y: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const EARTH_RADIUS_M = 6_378_137;
/** Mercator clips at ±85.051129°, where the projection would run to infinity. */
export const MAX_LATITUDE = 85.051_128_779_806_59;

export function toWorld(point: LatLng): WorldPoint {
  const lat = Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, point.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: (point.lng + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

export function fromWorld(point: WorldPoint): LatLng {
  const n = Math.PI * (1 - 2 * point.y);
  return {
    lat: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    lng: point.x * 360 - 180,
  };
}

/**
 * Metres per world unit at a given latitude. The Mercator scale factor is
 * 1/cos(lat), so a world unit is worth less ground the further from the
 * equator you stand, which is why a recap in Porto Alegre and one in Belém
 * cannot share a hard-coded constant.
 */
export function metresPerWorldUnit(latitude: number): number {
  const clamped = Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, latitude));
  return 2 * Math.PI * EARTH_RADIUS_M * Math.cos((clamped * Math.PI) / 180);
}

/** Great-circle distance in whole metres. */
export function haversineMetres(a: LatLng, b: LatLng): Metres {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** Compass bearing a→b in degrees, 0 = north, clockwise. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const lat1 = a.lat * toRad;
  const lat2 = b.lat * toRad;
  const dLng = (b.lng - a.lng) * toRad;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Shortest signed difference between two bearings, in (-180, 180]. */
export function bearingDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

export function boundsOf(points: readonly WorldPoint[]): WorldBounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsCentre(bounds: WorldBounds): WorldPoint {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

/**
 * The zoom at which `bounds` fills a viewport, with room left over.
 *
 * Zoom is the usual slippy-map exponent: the world is `256 * 2^zoom` pixels
 * across. A journey that never left one street corner would otherwise resolve
 * to zoom 30-something, so the result is clamped to something a tile server
 * actually serves.
 */
export function zoomToFit(
  bounds: WorldBounds,
  viewport: { width: number; height: number },
  options: { padding?: number; minZoom?: number; maxZoom?: number; tileSize?: number } = {},
): number {
  const padding = options.padding ?? 0.15;
  const tileSize = options.tileSize ?? 256;
  const minZoom = options.minZoom ?? 2;
  const maxZoom = options.maxZoom ?? 18;

  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-9);
  const usableWidth = viewport.width * (1 - padding * 2);
  const usableHeight = viewport.height * (1 - padding * 2);

  const zoomX = Math.log2(usableWidth / (spanX * tileSize));
  const zoomY = Math.log2(usableHeight / (spanY * tileSize));
  return clamp(Math.min(zoomX, zoomY), minZoom, maxZoom);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Ramer–Douglas–Peucker, iterative so a long route cannot blow the stack.
 *
 * Tolerance is expressed in metres and converted to world units at the
 * route's own latitude, so "keep anything that bends more than 8 m" means the
 * same thing everywhere in Brazil.
 */
export function simplifyWorld(
  points: readonly WorldPoint[],
  toleranceWorld: number,
): WorldPoint[] {
  if (points.length <= 2 || toleranceWorld <= 0) return [...points];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  const squaredTolerance = toleranceWorld * toleranceWorld;

  while (stack.length > 0) {
    const segment = stack.pop()!;
    const [first, last] = segment;
    if (last <= first + 1) continue;

    let farthest = -1;
    let farthestDistance = 0;
    const a = points[first]!;
    const b = points[last]!;

    for (let i = first + 1; i < last; i += 1) {
      const distance = squaredDistanceToSegment(points[i]!, a, b);
      if (distance > farthestDistance) {
        farthestDistance = distance;
        farthest = i;
      }
    }

    if (farthest !== -1 && farthestDistance > squaredTolerance) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }

  const out: WorldPoint[] = [];
  for (let i = 0; i < points.length; i += 1) {
    if (keep[i]) out.push(points[i]!);
  }
  return out;
}

function squaredDistanceToSegment(p: WorldPoint, a: WorldPoint, b: WorldPoint): number {
  let x = a.x;
  let y = a.y;
  let dx = b.x - x;
  let dy = b.y - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b.x;
      y = b.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p.x - x;
  dy = p.y - y;
  return dx * dx + dy * dy;
}
