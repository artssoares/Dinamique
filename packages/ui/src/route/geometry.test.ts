import { describe, expect, it } from 'vitest';
import { STANDSTILL_ZOOM, bounds, cameraFor, traceTo } from './geometry';

const SQUARE = [
  { lat: -23.55, lon: -46.64 },
  { lat: -23.55, lon: -46.63 },
  { lat: -23.54, lon: -46.63 },
];

describe('bounds', () => {
  it('finds the corners of a track', () => {
    expect(bounds(SQUARE)).toEqual({ ne: [-46.63, -23.54], sw: [-46.64, -23.55] });
  });

  it('has nothing to bound when there are no points', () => {
    expect(bounds([])).toBeNull();
  });
});

describe('traceTo', () => {
  it('has nothing to draw for fewer than two points', () => {
    expect(traceTo([{ lat: -23.55, lon: -46.63 }], 100, 100)).toBeNull();
    expect(traceTo([], 100, 100)).toBeNull();
  });

  it('stays inside the box', () => {
    const trace = traceTo(SQUARE, 200, 100, 10)!;
    for (const point of trace.points) {
      expect(point.x).toBeGreaterThanOrEqual(10);
      expect(point.x).toBeLessThanOrEqual(190);
      expect(point.y).toBeGreaterThanOrEqual(10);
      expect(point.y).toBeLessThanOrEqual(90);
    }
  });

  it('preserves the shape rather than stretching to fill', () => {
    // A square of ground in a wide box must come out square, centred — not
    // pulled into a rectangle. A straight run up an avenue that arrived as a
    // diagonal would be a different route.
    const square = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 0.01 },
      { lat: 0.01, lon: 0.01 },
      { lat: 0.01, lon: 0 },
    ];
    const trace = traceTo(square, 400, 100)!;
    const width =
      Math.max(...trace.points.map((p) => p.x)) - Math.min(...trace.points.map((p) => p.x));
    const height =
      Math.max(...trace.points.map((p) => p.y)) - Math.min(...trace.points.map((p) => p.y));
    expect(width).toBeCloseTo(height, 1);
    expect(height).toBeCloseTo(100, 0);
  });

  it('corrects for longitude converging away from the equator', () => {
    // The same degree span in each direction. At latitude 60 a degree of
    // longitude is half a degree of latitude on the ground.
    const trace = traceTo([{ lat: 60, lon: 0 }, { lat: 60.01, lon: 0.01 }], 1000, 1000)!;
    const width = Math.abs(trace.points[1]!.x - trace.points[0]!.x);
    const height = Math.abs(trace.points[1]!.y - trace.points[0]!.y);
    expect(width / height).toBeCloseTo(0.5, 1);
  });

  it('puts north at the top', () => {
    const trace = traceTo([{ lat: -23.56, lon: -46.63 }, { lat: -23.54, lon: -46.63 }], 100, 100)!;
    expect(trace.points[1]!.y).toBeLessThan(trace.points[0]!.y);
  });

  it('draws a route that runs along one axis without blowing up', () => {
    const trace = traceTo(
      [
        { lat: -23.55, lon: -46.64 },
        { lat: -23.55, lon: -46.63 },
        { lat: -23.55, lon: -46.62 },
      ],
      200,
      100,
    )!;
    expect(trace.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(trace.length).toBeGreaterThan(0);
  });

  it('measures the polyline exactly, segment by segment', () => {
    const trace = traceTo(SQUARE, 100, 100)!;
    let expected = 0;
    for (let i = 1; i < trace.points.length; i += 1) {
      expected += Math.hypot(
        trace.points[i]!.x - trace.points[i - 1]!.x,
        trace.points[i]!.y - trace.points[i - 1]!.y,
      );
    }
    expect(trace.length).toBeCloseTo(expected, 6);
    expect(trace.lengths.at(-1)).toBeCloseTo(trace.length, 6);
  });

  it('starts the path with a move and continues with lines', () => {
    expect(traceTo(SQUARE, 100, 100)!.d).toMatch(/^M[\d.-]+ [\d.-]+ L/);
  });
});

describe('cameraFor', () => {
  it('has nothing to point at without points', () => {
    expect(cameraFor([])).toBeNull();
  });

  it('fits a route that goes somewhere', () => {
    const camera = cameraFor([
      { lat: -23.55, lon: -46.63 },
      { lat: -23.52, lon: -46.6 },
    ]);
    expect(camera).toEqual({ kind: 'bounds', bounds: { ne: [-46.6, -23.52], sw: [-46.63, -23.55] } });
  });

  it('centres on a standstill instead of fitting a box with no area', () => {
    // Fitting this box asks the map for infinite zoom, and every library
    // answers it with a blurry rooftop.
    const camera = cameraFor([{ lat: -23.55, lon: -46.63 }]);
    expect(camera).toEqual({ kind: 'centre', centre: [-46.63, -23.55], zoom: STANDSTILL_ZOOM });
  });

  it('treats a few metres of parked drift as a standstill', () => {
    const camera = cameraFor([
      { lat: -23.55, lon: -46.63 },
      { lat: -23.550_02, lon: -46.630_03 },
    ]);
    expect(camera?.kind).toBe('centre');
  });
});
