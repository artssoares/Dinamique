import { describe, expect, it } from 'vitest';
import {
  acceptFix,
  fitToPointBudget,
  filterFixes,
  haversineMetres,
  MIN_TRIM_M,
  MAX_STORED_ROUTE_POINTS,
  MIN_GPS_DISTANCE_M,
  simplifyTrack,
  summariseTrack,
  trackDistance,
  trimRouteEnds,
  type Fix,
} from './tracking';

/** Builds a fix with sane defaults so each test states only what it is about. */
function fix(t: number, lat: number, lon: number, acc = 10, spd: number | null = null): Fix {
  return { t, lat, lon, acc, spd };
}

/**
 * A straight eastward run at roughly `stepM` metres per fix, one fix every
 * 10 seconds — the cadence the tracker actually requests.
 */
function straightRun(count: number, stepM = 100, startT = 0): Fix[] {
  const metrePerDegreeLon = 102_000; // near latitude -23, close enough for a fixture
  return Array.from({ length: count }, (_, i) =>
    fix(startT + i * 10_000, -23.55, -46.63 + (i * stepM) / metrePerDegreeLon),
  );
}

describe('haversineMetres', () => {
  it('measures São Paulo to Rio de Janeiro', () => {
    const distance = haversineMetres({ lat: -23.5505, lon: -46.6333 }, { lat: -22.9068, lon: -43.1729 });
    expect(distance).toBeGreaterThan(355_000);
    expect(distance).toBeLessThan(361_000);
  });

  it('measures São Paulo to Campinas', () => {
    const distance = haversineMetres({ lat: -23.5505, lon: -46.6333 }, { lat: -22.9099, lon: -47.0626 });
    // Straight line, ~84 km. The Anhanguera is ~95 km, which is exactly why a
    // sum of great-circle hops understates a drive and never inflates it.
    expect(distance).toBeGreaterThan(82_000);
    expect(distance).toBeLessThan(86_000);
  });

  it('is zero for the same point and symmetric between two', () => {
    const a = { lat: -23.55, lon: -46.63 };
    const b = { lat: -23.56, lon: -46.64 };
    expect(haversineMetres(a, a)).toBe(0);
    expect(haversineMetres(a, b)).toBe(haversineMetres(b, a));
  });
});

describe('acceptFix', () => {
  const here = { t: 0, lat: -23.55, lon: -46.63, acc: 10, spd: null };

  it('accepts the first believable fix', () => {
    expect(acceptFix(null, here)).toBe(true);
  });

  it('refuses a fix whose accuracy came back as null', () => {
    // A JSON round trip turns Infinity into null. Without an explicit finite
    // check, `null > 50` is false and the fix would be believed — exactly how
    // the live counter and the saved distance drifted apart.
    const roundTripped = JSON.parse(
      JSON.stringify({ ...here, acc: Number.POSITIVE_INFINITY }),
    ) as typeof here;
    expect(roundTripped.acc).toBeNull();
    expect(acceptFix(null, roundTripped)).toBe(false);
  });

  it('refuses a fix vaguer than the ceiling', () => {
    expect(acceptFix(null, { ...here, acc: 400 })).toBe(false);
  });

  it('refuses a step too small to be movement', () => {
    expect(acceptFix(here, { ...here, t: 10_000, lon: -46.63001 })).toBe(false);
  });

  it('refuses a step too fast to be a car', () => {
    expect(acceptFix(here, { ...here, t: 10_000, lon: -46.62 })).toBe(false);
  });

  it('accepts an ordinary step along a road', () => {
    expect(acceptFix(here, { ...here, t: 10_000, lon: -46.6297 })).toBe(true);
  });
});

describe('filterFixes', () => {
  it('drops fixes vaguer than the accuracy ceiling', () => {
    const fixes = [
      fix(0, -23.55, -46.63, 8),
      fix(10_000, -23.55, -46.629, 400), // under a viaduct
      fix(20_000, -23.55, -46.628, 8),
    ];
    expect(filterFixes(fixes)).toHaveLength(2);
  });

  it('drops a 300 km/h teleport', () => {
    const fixes = [
      fix(0, -23.55, -46.63),
      fix(10_000, -23.55, -46.62), // ~1 km in 10 s === 360 km/h
      fix(20_000, -23.55, -46.6295),
    ];
    expect(filterFixes(fixes).map((f) => f.t)).toEqual([0, 20_000]);
  });

  it('compares against the last accepted fix, not the last raw one', () => {
    // Without that rule the jump would be dropped and then the return to the
    // real position would ALSO look like a jump, losing two good fixes.
    const fixes = [
      fix(0, -23.55, -46.63),
      fix(10_000, -20.0, -40.0), // wild reacquisition
      fix(20_000, -23.55, -46.6285),
    ];
    expect(filterFixes(fixes).map((f) => f.t)).toEqual([0, 20_000]);
  });

  it('contributes nothing for twenty parked minutes of drift', () => {
    const parked: Fix[] = Array.from({ length: 120 }, (_, i) =>
      fix(i * 10_000, -23.55 + (i % 3) * 0.00002, -46.63 + (i % 2) * 0.00003),
    );
    expect(trackDistance(filterFixes(parked))).toBe(0);
  });

  it('keeps a genuine straight run intact', () => {
    expect(filterFixes(straightRun(20))).toHaveLength(20);
  });

  it('discards coordinates that are not numbers', () => {
    expect(filterFixes([fix(0, -23.55, -46.63), fix(10_000, Number.NaN, -46.62)])).toHaveLength(1);
  });
});

describe('simplifyTrack', () => {
  it('reduces a straight line to its two endpoints', () => {
    const line = straightRun(50).map((f) => ({ lat: f.lat, lon: f.lon }));
    expect(simplifyTrack(line)).toHaveLength(2);
  });

  it('preserves a corner', () => {
    expect(
      simplifyTrack([
        { lat: -23.55, lon: -46.63 },
        { lat: -23.55, lon: -46.62 },
        { lat: -23.54, lon: -46.62 },
      ]),
    ).toHaveLength(3);
  });

  it('treats east–west and north–south tolerance alike', () => {
    // Same ~40 m deviation each way; degrees alone would not agree.
    expect(
      simplifyTrack([
        { lat: -23.55, lon: -46.63 },
        { lat: -23.5504, lon: -46.629 },
        { lat: -23.55, lon: -46.628 },
      ]),
    ).toHaveLength(3);
    expect(
      simplifyTrack([
        { lat: -23.55, lon: -46.63 },
        { lat: -23.5495, lon: -46.62961 },
        { lat: -23.549, lon: -46.63 },
      ]),
    ).toHaveLength(3);
  });
});

describe('fitToPointBudget', () => {
  it('respects the ceiling even for a track that resists simplification', () => {
    // A zigzag: every point is a corner, so Douglas–Peucker cannot drop any.
    const zigzag = Array.from({ length: 2_500 }, (_, i) => ({
      lat: -23.55 + (i % 2) * 0.002,
      lon: -46.63 + i * 0.0005,
    }));
    const fitted = fitToPointBudget(zigzag);
    expect(fitted.length).toBeLessThanOrEqual(MAX_STORED_ROUTE_POINTS);
    expect(fitted.length).toBeGreaterThan(1);
  });

  it('thins rather than truncating, keeping both true ends', () => {
    // Cutting the tail would end the drawn route mid-shift, and the privacy
    // trim would then hide a fabricated endpoint rather than the real one.
    const zigzag = Array.from({ length: 2_500 }, (_, i) => ({
      lat: -23.55 + (i % 2) * 0.002,
      lon: -46.63 + i * 0.0005,
    }));
    const fitted = fitToPointBudget(zigzag);
    expect(fitted[0]).toEqual(zigzag[0]);
    expect(fitted.at(-1)).toEqual(zigzag.at(-1));
  });

  it('leaves a track already under the budget untouched', () => {
    const line = straightRun(10).map((f) => ({ lat: f.lat, lon: f.lon }));
    expect(fitToPointBudget(line)).toHaveLength(10);
  });
});

describe('trimRouteEnds', () => {
  it('never eats more than a tenth of a route from either end', () => {
    const shape = straightRun(60, 100).map((f) => ({ lat: f.lat, lon: f.lon }));
    const before = trackDistance(shape);
    const after = trackDistance(trimRouteEnds(shape));
    expect(after).toBeGreaterThan(before * 0.75);
  });

  it('trims the full budget from a long route', () => {
    const shape = straightRun(400).map((f) => ({ lat: f.lat, lon: f.lon }));
    const before = trackDistance(shape);
    const after = trackDistance(trimRouteEnds(shape));
    expect(before - after).toBeGreaterThan(900);
    expect(before - after).toBeLessThan(1_300);
  });

  it('refuses a route too short to hide anything in', () => {
    // Returning these whole would publish the exact spot the driver set off
    // from, which is the one thing the trim exists to stop.
    expect(
      trimRouteEnds([
        { lat: -23.55, lon: -46.63 },
        { lat: -23.5501, lon: -46.6301 },
      ]),
    ).toEqual([]);
  });

  it('shares a short shift the old rule refused outright', () => {
    // ~1 km. The proportional trim is 100 m, under the minimum, and the old
    // rule read that as "refuse" — so the driver was told a one kilometre day
    // was too short to share. The minimum raises the budget instead.
    const shortShift = straightRun(50, 20).map((f) => ({ lat: f.lat, lon: f.lon }));
    expect(trackDistance(shortShift)).toBeLessThan(1_500);

    const trimmed = trimRouteEnds(shortShift);
    expect(trimmed.length).toBeGreaterThanOrEqual(2);
    expect(haversineMetres(shortShift[0]!, trimmed[0]!)).toBeGreaterThanOrEqual(MIN_TRIM_M);
    expect(haversineMetres(shortShift.at(-1)!, trimmed.at(-1)!)).toBeGreaterThanOrEqual(
      MIN_TRIM_M,
    );
  });

  it('never publishes a point inside the minimum radius', () => {
    // The whole point of the minimum. A 300 m errand cannot give up 150 m from
    // each end and still leave a line, so it is not published at all — a
    // picture starting thirty metres from someone's gate is their address.
    const errand = straightRun(30, 10).map((f) => ({ lat: f.lat, lon: f.lon }));
    expect(trackDistance(errand)).toBeLessThan(2 * MIN_TRIM_M);
    expect(trimRouteEnds(errand)).toEqual([]);
  });

  it('refuses a route that never leaves its own neighbourhood', () => {
    // Out and straight back: plenty of metres walked, never far from home.
    const outAndBack = [...straightRun(8, 12), ...straightRun(8, 12).reverse()].map((f) => ({
      lat: f.lat,
      lon: f.lon,
    }));
    expect(trimRouteEnds(outAndBack)).toEqual([]);
  });

  it('refuses a pile of points in one place', () => {
    const stacked = Array.from({ length: 20 }, () => ({ lat: -23.55, lon: -46.63 }));
    expect(trimRouteEnds(stacked)).toEqual([]);
  });
});

describe('trimRouteEnds never leaks an endpoint', () => {
  const shapes: Array<{ name: string; points: { lat: number; lon: number }[] }> = [
    {
      name: 'a huge closing leg after tiny opening ones',
      points: [
        { lat: -23.55, lon: -46.63 },
        { lat: -23.55009, lon: -46.63 },
        { lat: -23.55018, lon: -46.63 },
        { lat: -23.5547, lon: -46.63 },
        { lat: -23.6, lon: -46.63 },
      ],
    },
    {
      name: 'a huge opening leg before tiny closing ones',
      points: [
        { lat: -23.6, lon: -46.63 },
        { lat: -23.5547, lon: -46.63 },
        { lat: -23.55018, lon: -46.63 },
        { lat: -23.55009, lon: -46.63 },
        { lat: -23.55, lon: -46.63 },
      ],
    },
    {
      name: 'a route that comes home',
      points: [...straightRun(15), ...straightRun(15).reverse()].map((f) => ({
        lat: f.lat,
        lon: f.lon,
      })),
    },
    { name: 'a full shift', points: straightRun(400).map((f) => ({ lat: f.lat, lon: f.lon })) },
  ];

  for (const { name, points } of shapes) {
    it(`hides both ends of ${name}`, () => {
      const trimmed = trimRouteEnds(points);
      if (trimmed.length === 0) return; // Refusing to share is always allowed.
      expect(trimmed.length).toBeGreaterThanOrEqual(2);
      expect(trimmed[0]).not.toEqual(points[0]);
      expect(trimmed.at(-1)).not.toEqual(points.at(-1));
    });
  }

  it('holds for every prefix of a real-shaped shift', () => {
    const full = straightRun(60).map((f) => ({ lat: f.lat, lon: f.lon }));
    for (let length = 2; length <= full.length; length += 1) {
      const points = full.slice(0, length);
      const trimmed = trimRouteEnds(points);
      if (trimmed.length === 0) continue;
      expect(trimmed[0], `length ${length}`).not.toEqual(points[0]);
      expect(trimmed.at(-1), `length ${length}`).not.toEqual(points.at(-1));
    }
  });
});

describe('trimRouteEnds hides the place, not just the points', () => {
  /** A loop of `radius` metres, then a straight run away from it. */
  function loopThenRun(radius: number, laps: number, runPoints: number) {
    const metrePerDegree = 111_000;
    const loop = Array.from({ length: laps * 12 }, (_, i) => {
      const angle = (i / 12) * 2 * Math.PI;
      return {
        lat: -23.55 + (radius * Math.sin(angle)) / metrePerDegree,
        lon:
          -46.63 +
          (radius * Math.cos(angle)) / (metrePerDegree * Math.cos(-23.55 * (Math.PI / 180))),
      };
    });
    const away = Array.from({ length: runPoints }, (_, i) => ({
      lat: -23.55 + ((i + 1) * 200) / metrePerDegree,
      lon: -46.63,
    }));
    return [...loop, ...away];
  }

  it('does not publish a start a stone’s throw from where the driver set off', () => {
    // Circling the block covers the whole budget in metres travelled while
    // finishing barely thirty metres from the front door. Walking the path
    // alone would have called that trimmed.
    const shape = loopThenRun(30, 6, 60);
    const trimmed = trimRouteEnds(shape);
    if (trimmed.length === 0) return;
    expect(haversineMetres(shape[0]!, trimmed[0]!)).toBeGreaterThan(140);
  });

  it('does not publish an end a stone’s throw from where the driver stopped', () => {
    const shape = loopThenRun(30, 6, 60).reverse();
    const trimmed = trimRouteEnds(shape);
    if (trimmed.length === 0) return;
    expect(haversineMetres(shape.at(-1)!, trimmed.at(-1)!)).toBeGreaterThan(140);
  });

  it('still keeps a normal shift usable', () => {
    const shift = straightRun(400).map((f) => ({ lat: f.lat, lon: f.lon }));
    expect(trimRouteEnds(shift).length).toBeGreaterThan(300);
  });
});

describe('summariseTrack', () => {
  it('measures a clean shift', () => {
    const summary = summariseTrack(straightRun(100));
    expect(summary.distance!).toBeGreaterThan(9_500);
    expect(summary.distance!).toBeLessThan(10_500);
  });

  it('returns null rather than a small wrong number below the fix minimum', () => {
    expect(summariseTrack(straightRun(4)).distance).toBeNull();
  });

  it('returns null rather than a small wrong number below the distance minimum', () => {
    const shuffling = straightRun(20, 5);
    expect(trackDistance(shuffling)).toBeLessThan(MIN_GPS_DISTANCE_M);
    expect(summariseTrack(shuffling).distance).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(summariseTrack([])).toEqual({
      distance: null,
      points: [],
      pointCount: 0,
      droppedFixes: 0,
      movingSeconds: 0,
    });
  });

  it('still draws where the driver was, below the fix minimum', () => {
    // The drawing and the km figure are different promises. A driver who
    // opened and closed a journey without leaving the block gets a map of
    // where they stood; what they do not get is a distance nobody would
    // recognise standing in for their R$/km.
    const summary = summariseTrack(straightRun(4));
    expect(summary.distance).toBeNull();
    expect(summary.points.length).toBeGreaterThan(0);
  });

  it('draws a standstill as the single point it is', () => {
    // Twenty minutes of parked drift: only the first fix clears the
    // stationary threshold, and one point is still a place.
    const parked = Array.from({ length: 40 }, (_, i) =>
      fix(i * 30_000, -23.55 + (i % 2) * 0.00002, -46.63 - (i % 3) * 0.00002),
    );
    const summary = summariseTrack(parked);
    expect(summary.distance).toBeNull();
    expect(summary.points).toEqual([{ lat: parked[0]!.lat, lon: parked[0]!.lon }]);
  });

  it('counts the fixes it refused to believe', () => {
    expect(summariseTrack([...straightRun(30), fix(500_000, -23.55, -46.63, 900)]).droppedFixes)
      .toBe(1);
  });

  it('stores a shape with no timestamps riding along', () => {
    for (const point of summariseTrack(straightRun(100)).points) {
      expect(Object.keys(point).sort()).toEqual(['lat', 'lon']);
    }
  });

  it('never exceeds the storage budget', () => {
    const long = Array.from({ length: 2_500 }, (_, i) =>
      fix(i * 10_000, -23.55 + (i % 2) * 0.002, -46.63 + i * 0.0005),
    );
    expect(summariseTrack(long).pointCount).toBeLessThanOrEqual(MAX_STORED_ROUTE_POINTS);
  });
});

describe('a gap in the track is not distance', () => {
  it('leaves out the jump across a break', () => {
    const before = straightRun(20); // ~2 km
    // Two hours later, five kilometres away: the drive to lunch and back,
    // recorded by nobody because capture was stopped.
    const after = straightRun(20, 100, 7_200_000).map((f) => ({ ...f, lon: f.lon + 0.05 }));

    const summary = summariseTrack([...before, ...after]);
    const naive = trackDistance([...before, ...after].map((f) => ({ lat: f.lat, lon: f.lon })));

    expect(summary.distance!).toBeLessThan(4_500);
    expect(naive).toBeGreaterThan(summary.distance! + 3_000);
  });

  it('excludes a long stop from moving time', () => {
    const before = straightRun(20);
    const after = straightRun(20, 100, 7_200_000).map((f) => ({ ...f, lon: f.lon + 0.05 }));
    expect(summariseTrack([...before, ...after]).movingSeconds).toBeLessThan(1_000);
  });

  it('leaves out a short deliberate stop the length rule would miss', () => {
    // Ninety seconds is long enough to drive somewhere and nowhere near the
    // two-minute threshold, which is why the device says when it stopped.
    const before = straightRun(20);
    const resumedAt = before.at(-1)!.t + 90_000;
    // About three kilometres on: deliberately under the speed ceiling, since a
    // jump the filter rejects outright never reaches the break rule at all.
    const after = straightRun(20, 100, resumedAt).map((f) => ({ ...f, lon: f.lon + 0.048 }));

    const withoutBreak = summariseTrack([...before, ...after]);
    const withBreak = summariseTrack([...before, ...after], [resumedAt]);

    expect(withoutBreak.distance! - withBreak.distance!).toBeGreaterThan(2_500);
  });

  it('ignores a break that falls outside the track', () => {
    const fixes = straightRun(60);
    expect(summariseTrack(fixes, [fixes.at(-1)!.t + 999_999]).distance).toBe(
      summariseTrack(fixes).distance,
    );
  });

  it('agrees with the running total the live counter keeps', () => {
    // The card counts fix by fix with `acceptFix`; the close re-runs the whole
    // filter. A shift with no gaps must give both the same answer.
    const fixes = straightRun(60);
    let running = 0;
    let last: Fix | null = null;
    for (const f of fixes) {
      if (acceptFix(last, f)) {
        if (last) running += haversineMetres(last, f);
        last = f;
      }
    }
    expect(summariseTrack(fixes).distance).toBe(running);
  });
});
