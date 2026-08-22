import type { LatLng } from '@dinamique/types';

/**
 * Google's encoded polyline algorithm.
 *
 * This is a wire encoding, not a business rule — it makes no decision about a
 * driver's numbers, it only makes a list of coordinates small enough to store.
 * That is why it lives beside `units.ts` and `money.ts` rather than in
 * @dinamique/business-logic, which depends on this package and not the reverse.
 *
 * At precision 5 a coordinate resolves to roughly 1 m, finer than any consumer
 * GPS fix we would trust anyway (see MAX_ACCEPTABLE_ACCURACY_M).
 */
export const POLYLINE_PRECISION = 5;

const CHUNK_BITS = 5;
const CHUNK_MASK = 0x1f;
const CONTINUATION_BIT = 0x20;
const ASCII_OFFSET = 63;

function encodeSigned(value: number): string {
  // The sign is carried in bit 0 after a left shift, and negatives are
  // inverted so that small magnitudes stay short in either direction.
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (v >= CONTINUATION_BIT) {
    out += String.fromCharCode(((v & CHUNK_MASK) | CONTINUATION_BIT) + ASCII_OFFSET);
    v >>= CHUNK_BITS;
  }
  return out + String.fromCharCode(v + ASCII_OFFSET);
}

export function encodePolyline(
  points: readonly LatLng[],
  precision: number = POLYLINE_PRECISION,
): string {
  const factor = 10 ** precision;
  let previousLat = 0;
  let previousLon = 0;
  let out = '';

  for (const point of points) {
    // Rounding before differencing is what makes the round trip stable: the
    // decoder can only ever return the rounded value, so the encoder must
    // difference the same integers it emits.
    const lat = Math.round(point.lat * factor);
    const lon = Math.round(point.lon * factor);
    out += encodeSigned(lat - previousLat);
    out += encodeSigned(lon - previousLon);
    previousLat = lat;
    previousLon = lon;
  }

  return out;
}

export function decodePolyline(
  encoded: string,
  precision: number = POLYLINE_PRECISION,
): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index++) - ASCII_OFFSET;
      result |= (byte & CHUNK_MASK) << shift;
      shift += CHUNK_BITS;
    } while (byte >= CONTINUATION_BIT && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - ASCII_OFFSET;
      result |= (byte & CHUNK_MASK) << shift;
      shift += CHUNK_BITS;
    } while (byte >= CONTINUATION_BIT && index < encoded.length);
    lon += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / factor, lon: lon / factor });
  }

  return points;
}
