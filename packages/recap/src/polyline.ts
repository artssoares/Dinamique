/**
 * Google encoded polyline, precision 5.
 *
 * The wire format for a route. A ten-hour journey sampled every five seconds
 * is ~7 200 fixes; as JSON that is around 250 KB, and as an encoded polyline
 * around 45 KB. The driver is on mobile data, often at the edge of coverage,
 * so the difference is not academic.
 *
 * Precision 5 quantises to roughly 1.1 m, which is well inside the accuracy of
 * a phone GPS and far inside what a recap can draw. Encoding is therefore
 * lossy on purpose, and `decode(encode(p))` is asserted to round-trip within
 * that tolerance rather than exactly.
 */

const PRECISION = 1e5;

export interface LatLng {
  lat: number;
  lng: number;
}

function encodeSigned(value: number, out: string[]): void {
  // Zig-zag: the sign lands in the low bit so small negative deltas stay short.
  let v = value < 0 ? ~(value << 1) : value << 1;
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
    v >>>= 5;
  }
  out.push(String.fromCharCode(v + 63));
}

export function encodePolyline(points: readonly LatLng[]): string {
  const out: string[] = [];
  let lastLat = 0;
  let lastLng = 0;

  for (const point of points) {
    const lat = Math.round(point.lat * PRECISION);
    const lng = Math.round(point.lng * PRECISION);
    encodeSigned(lat - lastLat, out);
    encodeSigned(lng - lastLng, out);
    lastLat = lat;
    lastLng = lng;
  }

  return out.join('');
}

/**
 * Decodes as much as the string legitimately contains. A truncated payload ,
 * a batch cut off mid-flush, yields the points that did arrive rather than
 * throwing, because half a route still makes a recap and an exception in a
 * share sheet does not.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const dLat = decodeSigned();
    if (dLat === null) break;
    const dLng = decodeSigned();
    if (dLng === null) break;
    lat += dLat;
    lng += dLng;
    points.push({ lat: lat / PRECISION, lng: lng / PRECISION });
  }

  return points;

  function decodeSigned(): number | null {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}

/**
 * Millisecond offsets travel beside the polyline as comma-separated deltas.
 * Deltas rather than absolutes because a five-second sample rate makes every
 * value the same three digits, which compresses to nearly nothing.
 */
export function encodeOffsets(offsetsMs: readonly number[]): string {
  const out: number[] = [];
  let previous = 0;
  for (const offset of offsetsMs) {
    out.push(Math.round(offset) - previous);
    previous = Math.round(offset);
  }
  return out.join(',');
}

export function decodeOffsets(encoded: string): number[] {
  if (encoded.trim() === '') return [];
  const out: number[] = [];
  let running = 0;
  for (const part of encoded.split(',')) {
    const delta = Number(part);
    if (!Number.isFinite(delta)) break;
    running += delta;
    out.push(running);
  }
  return out;
}
