import { describe, expect, it } from 'vitest';
import { decodePolyline, encodePolyline, POLYLINE_PRECISION } from './polyline';

describe('encodePolyline', () => {
  it('matches the canonical Google fixture', () => {
    const points = [
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ];
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });

  it('encodes nothing for an empty track', () => {
    expect(encodePolyline([])).toBe('');
  });
});

describe('decodePolyline', () => {
  it('reverses the canonical fixture', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
  });

  it('decodes nothing from an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});

describe('round trip', () => {
  it('survives a São Paulo shift at the default precision', () => {
    const points = [
      { lat: -23.5505, lon: -46.6333 },
      { lat: -23.5512, lon: -46.6341 },
      { lat: -23.5533, lon: -46.6402 },
      { lat: -23.5601, lon: -46.6455 },
      { lat: -23.5498, lon: -46.6512 },
    ];
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });

  it('survives coordinates that cross the equator and the meridian', () => {
    const points = [
      { lat: 0.0001, lon: -0.0001 },
      { lat: -0.0002, lon: 0.0003 },
      { lat: 0, lon: 0 },
    ];
    expect(decodePolyline(encodePolyline(points))).toEqual(points);
  });

  it('rounds to the requested precision rather than drifting', () => {
    const decoded = decodePolyline(encodePolyline([{ lat: -23.55051234, lon: -46.63339876 }]));
    expect(decoded[0]!.lat).toBeCloseTo(-23.55051, 5);
    expect(decoded[0]!.lon).toBeCloseTo(-46.6334, 5);
  });

  it('honours a lower precision on both sides', () => {
    const points = [
      { lat: -23.55, lon: -46.63 },
      { lat: -23.56, lon: -46.64 },
    ];
    const encoded = encodePolyline(points, 2);
    expect(decodePolyline(encoded, 2)).toEqual(points);
    // Precision is not self-describing — decoding with the wrong one is wrong.
    expect(decodePolyline(encoded, POLYLINE_PRECISION)).not.toEqual(points);
  });
});
