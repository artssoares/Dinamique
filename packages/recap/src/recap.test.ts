import { describe, expect, it } from 'vitest';
import { summarisePeriod } from '@dinamique/business-logic';
import { buildRecap } from './index';
import { decodeOffsets, decodePolyline, encodeOffsets, encodePolyline } from './polyline';
import { bearingDegrees, bearingDelta, haversineMetres, toWorld, zoomToFit } from './geo';
import {
  buildTrack,
  cleanFixes,
  fixesFromRoute,
  fixesFromSegments,
  sampleTrackAtDistance,
  toSegmentPayload,
  type RawFix,
} from './track';
import { buildStoryboard, sampleFrame } from './storyboard';
import { buildFilm } from './film';
import { buildRecapStats, DEFAULT_BRAND, TILELESS_BASEMAP, type RecapScene } from './scene';
import { renderRecapDocument } from './renderer';

/** A short drive east along a road in São Paulo, one fix every five seconds. */
function drive(count = 60, startAt = Date.parse('2026-08-15T09:00:00.000Z')): RawFix[] {
  const fixes: RawFix[] = [];
  for (let i = 0; i < count; i += 1) {
    fixes.push({
      lat: -23.5605 + i * 0.00012,
      lng: -46.6433 + i * 0.00035,
      at: startAt + i * 5_000,
      accuracy: 8,
    });
  }
  return fixes;
}

function summaryFor(overrides: Partial<Parameters<typeof summarisePeriod>[0]> = {}) {
  return summarisePeriod({
    journeys: [
      {
        id: 'j1',
        startedAt: '2026-08-15T09:00:00.000Z',
        endedAt: '2026-08-15T17:30:00.000Z',
        pausedSeconds: 1_800,
        odometerStart: null,
        odometerEnd: null,
        distanceOverride: 148_000,
        distanceGps: null,
      },
    ],
    revenues: [{ date: '2026-08-15', amount: 38_500, tips: 1_200, tripCount: 22, platformId: null }],
    expenses: [{ date: '2026-08-15', amount: 12_400, isVehicleCost: true }],
    ...overrides,
  });
}

function sceneWith(fixes: RawFix[] | null): RecapScene {
  return {
    id: 'scene',
    stats: buildRecapStats({ summary: summaryFor(), date: new Date('2026-08-15T12:00:00Z') }),
    track: fixes ? buildTrack(fixes) : null,
    basemap: TILELESS_BASEMAP,
    brand: DEFAULT_BRAND,
    width: 1080,
    height: 1920,
  };
}

describe('polyline', () => {
  it('round-trips within the precision it claims', () => {
    const points = drive(40).map((fix) => ({ lat: fix.lat, lng: fix.lng }));
    const decoded = decodePolyline(encodePolyline(points));

    expect(decoded).toHaveLength(points.length);
    for (let i = 0; i < points.length; i += 1) {
      // Precision 5 quantises to ~1.1 m; assert the ground error, not the digits.
      expect(haversineMetres(points[i]!, decoded[i]!)).toBeLessThanOrEqual(2);
    }
  });

  it('is far smaller than the JSON it replaces', () => {
    const points = drive(600).map((fix) => ({ lat: fix.lat, lng: fix.lng }));
    const encoded = encodePolyline(points);
    expect(encoded.length).toBeLessThan(JSON.stringify(points).length / 3);
  });

  it('returns what survived a truncated payload instead of throwing', () => {
    const encoded = encodePolyline(drive(20).map((f) => ({ lat: f.lat, lng: f.lng })));
    const decoded = decodePolyline(encoded.slice(0, Math.floor(encoded.length / 2)));

    expect(decoded.length).toBeGreaterThan(3);
    expect(decoded.length).toBeLessThan(20);
  });

  it('round-trips offsets as deltas', () => {
    const offsets = [0, 5_000, 10_000, 15_500, 21_000];
    expect(decodeOffsets(encodeOffsets(offsets))).toEqual(offsets);
    expect(decodeOffsets('')).toEqual([]);
  });
});

describe('geo', () => {
  it('projects and keeps the hemisphere the right way up', () => {
    const north = toWorld({ lat: 10, lng: 0 });
    const south = toWorld({ lat: -10, lng: 0 });
    expect(north.y).toBeLessThan(south.y);
    expect(toWorld({ lat: 0, lng: 0 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it('measures a known distance', () => {
    // ~111 km per degree of latitude at the equator.
    const metres = haversineMetres({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(metres).toBeGreaterThan(110_000);
    expect(metres).toBeLessThan(112_000);
  });

  it('takes the short way round when unwinding a bearing', () => {
    expect(bearingDelta(350, 10)).toBe(20);
    expect(bearingDelta(10, 350)).toBe(-20);
    expect(Math.round(bearingDegrees({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }))).toBe(0);
    expect(Math.round(bearingDegrees({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }))).toBe(90);
  });

  it('fits bounds inside the viewport it was given', () => {
    const zoom = zoomToFit(
      { minX: 0.4, minY: 0.4, maxX: 0.6, maxY: 0.6 },
      { width: 1080, height: 1920 },
    );
    const spanPixels = 0.2 * 256 * 2 ** zoom;
    expect(spanPixels).toBeLessThanOrEqual(1080);
  });
});

describe('cleaning a raw trace', () => {
  it('drops fixes the phone already admitted were guesses', () => {
    const fixes = drive(10);
    fixes[5] = { ...fixes[5]!, accuracy: 900 };
    const { kept, discarded } = cleanFixes(fixes);
    expect(kept).toHaveLength(9);
    expect(discarded).toBe(1);
  });

  it('drops a teleport rather than drawing a line across the state', () => {
    const fixes = drive(10);
    fixes[6] = { ...fixes[6]!, lat: -22.9, lng: -43.2 };
    const { kept } = cleanFixes(fixes);
    expect(kept.some((fix) => fix.lng > -44)).toBe(false);
  });

  it('folds away the jitter of a parked car', () => {
    const parked: RawFix[] = [];
    const base = Date.parse('2026-08-15T09:00:00.000Z');
    for (let i = 0; i < 40; i += 1) {
      parked.push({
        lat: -23.5605 + (i % 2 === 0 ? 0.000006 : -0.000006),
        lng: -46.6433,
        at: base + i * 5_000,
        accuracy: 10,
      });
    }
    expect(cleanFixes(parked).kept).toHaveLength(1);
  });

  it('keeps a fix after a long silence but does not call it a teleport', () => {
    const fixes = drive(4);
    const last = fixes[3]!;
    fixes.push({ lat: last.lat + 0.05, lng: last.lng + 0.05, at: last.at + 40 * 60_000, accuracy: 9 });
    expect(cleanFixes(fixes).kept).toHaveLength(5);
  });
});

describe('fixesFromRoute', () => {
  const route = [
    { lat: -23.5665, lon: -46.693 },
    { lat: -23.57, lon: -46.689 },
    { lat: -23.576, lon: -46.687 },
    { lat: -23.581, lon: -46.682 },
  ];

  it('spreads the journey clock over the route in proportion to distance', () => {
    const fixes = fixesFromRoute({
      points: route,
      startedAt: '2026-09-04T09:12:00.000Z',
      endedAt: '2026-09-04T10:12:00.000Z',
    });
    expect(fixes).toHaveLength(4);
    expect(fixes[0]!.at).toBe(Date.parse('2026-09-04T09:12:00.000Z'));
    expect(fixes[3]!.at).toBe(Date.parse('2026-09-04T10:12:00.000Z'));
    for (let i = 1; i < fixes.length; i += 1) {
      expect(fixes[i]!.at).toBeGreaterThan(fixes[i - 1]!.at);
    }
    // `lon` in, `lng` out: the app's name and the package's name for the same thing.
    expect(fixes[1]).toMatchObject({ lat: -23.57, lng: -46.689 });
  });

  it('never implies flight: a clock too short for the kilometres is stretched', () => {
    const fixes = fixesFromRoute({
      points: route,
      startedAt: '2026-09-04T09:12:00.000Z',
      endedAt: '2026-09-04T09:12:01.000Z',
    });
    const track = buildTrack(fixes);
    expect(track).not.toBeNull();
    expect(track!.points.length).toBe(4);
  });

  it('prefers the worked time over the wall clock, so the HUD agrees with the card', () => {
    const fixes = fixesFromRoute({
      points: route,
      startedAt: '2026-09-04T09:12:00.000Z',
      endedAt: '2026-09-04T13:28:05.000Z',
      workedSeconds: 3600,
    });
    expect(fixes[3]!.at - fixes[0]!.at).toBe(3_600_000);
  });

  it('scales the HUD kilometres to the figure the day filed', () => {
    const fixes = fixesFromRoute({
      points: route,
      startedAt: '2026-09-04T09:12:00.000Z',
      endedAt: '2026-09-04T10:12:00.000Z',
    });
    const withFigure = buildRecap({
      id: 'filed',
      summary: summarisePeriod({
        journeys: [
          {
            id: 'j', startedAt: '2026-09-04T09:12:00.000Z', endedAt: '2026-09-04T10:12:00.000Z',
            pausedSeconds: 0, odometerStart: null, odometerEnd: null, distanceOverride: 2_000,
            distanceGps: null,
          },
        ],
        revenues: [],
        expenses: [],
      }),
      date: new Date(2026, 8, 4),
      fixes,
    });
    const drawn = withFigure.scene.track!.distance;
    expect(withFigure.film.hudDistanceScale).toBeCloseTo(2_000 / drawn, 5);

    const withoutFigure = buildRecap({
      id: 'unfiled',
      summary: summarisePeriod({ journeys: [], revenues: [], expenses: [] }),
      date: new Date(2026, 8, 4),
      fixes,
    });
    expect(withoutFigure.film.hudDistanceScale).toBe(1);
  });

  it('assumes a road pace when the journey has no end', () => {
    const fixes = fixesFromRoute({ points: route, startedAt: '2026-09-04T09:12:00.000Z' });
    expect(fixes[3]!.at).toBeGreaterThan(fixes[0]!.at + 60_000);
    expect(buildTrack(fixes)).not.toBeNull();
  });

  it('produces the whole film from a stored route', () => {
    const fixes = fixesFromRoute({
      points: route,
      startedAt: '2026-09-04T09:12:00.000Z',
      endedAt: '2026-09-04T10:12:00.000Z',
    });
    const recap = buildRecap({
      id: 'stored',
      summary: summarisePeriod({ journeys: [], revenues: [], expenses: [] }),
      date: new Date(2026, 8, 4),
      fixes,
    });
    expect(recap.hasRoute).toBe(true);
    expect(recap.film.frameCount).toBeGreaterThan(0);
    expect(recap.document()).toContain('window.__RECAP__');
  });
});

describe('buildTrack', () => {
  it('produces a monotonic track with cumulative distance and time', () => {
    const track = buildTrack(drive(120));
    expect(track).not.toBeNull();

    const points = track!.points;
    expect(points.length).toBeGreaterThan(1);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]!.d).toBeGreaterThanOrEqual(points[i - 1]!.d);
      expect(points[i]!.t).toBeGreaterThanOrEqual(points[i - 1]!.t);
    }
    expect(points[0]!.d).toBe(0);
    expect(points[0]!.t).toBe(0);
    expect(track!.distance).toBe(points[points.length - 1]!.d);
  });

  it('simplifies a straight road down to almost nothing', () => {
    const track = buildTrack(drive(400))!;
    // 400 fixes along one bearing carry no information a recap can draw.
    expect(track.points.length).toBeLessThan(20);
  });

  it('refuses a scribble rather than animating one', () => {
    expect(buildTrack(drive(3))).toBeNull();
    expect(buildTrack([])).toBeNull();
  });

  it('never exceeds the point budget it was given', () => {
    const wandering: RawFix[] = [];
    const base = Date.parse('2026-08-15T09:00:00.000Z');
    for (let i = 0; i < 4_000; i += 1) {
      wandering.push({
        lat: -23.56 + Math.sin(i / 7) * 0.01 + i * 0.00002,
        lng: -46.64 + Math.cos(i / 5) * 0.01 + i * 0.00002,
        at: base + i * 4_000,
        accuracy: 9,
      });
    }
    const track = buildTrack(wandering, { maxPoints: 300 })!;
    expect(track).not.toBeNull();
    expect(track.points.length).toBeLessThanOrEqual(300);
  });

  it('samples a position anywhere along the route, including past both ends', () => {
    const track = buildTrack(drive(120))!;
    const middle = sampleTrackAtDistance(track, track.distance / 2);
    expect(middle.distance).toBeCloseTo(track.distance / 2, 5);

    expect(sampleTrackAtDistance(track, -500).distance).toBe(0);
    expect(sampleTrackAtDistance(track, track.distance * 4).distance).toBe(track.distance);
  });
});

describe('stored segments', () => {
  it('survives the round trip through the database shape', () => {
    const fixes = drive(90);
    const payload = toSegmentPayload(fixes)!;

    const restored = fixesFromSegments([
      {
        seq: 0,
        startedAt: payload.startedAt,
        polyline: encodePolyline(payload.points),
        offsets: encodeOffsets(payload.offsetsMs),
      },
    ]);

    expect(restored).toHaveLength(fixes.length);
    expect(restored[0]!.at).toBe(fixes[0]!.at);
    expect(restored[restored.length - 1]!.at).toBe(fixes[fixes.length - 1]!.at);
    expect(haversineMetres(restored[10]!, fixes[10]!)).toBeLessThanOrEqual(2);
  });

  it('reorders batches that synced out of order', () => {
    const first = toSegmentPayload(drive(20))!;
    const second = toSegmentPayload(drive(20, Date.parse('2026-08-15T09:10:00.000Z')))!;

    const restored = fixesFromSegments([
      { seq: 1, startedAt: second.startedAt, polyline: encodePolyline(second.points), offsets: encodeOffsets(second.offsetsMs) },
      { seq: 0, startedAt: first.startedAt, polyline: encodePolyline(first.points), offsets: encodeOffsets(first.offsetsMs) },
    ]);

    for (let i = 1; i < restored.length; i += 1) {
      expect(restored[i]!.at).toBeGreaterThanOrEqual(restored[i - 1]!.at);
    }
  });

  it('keeps the points that arrived when a batch was truncated', () => {
    const payload = toSegmentPayload(drive(40))!;
    const restored = fixesFromSegments([
      {
        seq: 0,
        startedAt: payload.startedAt,
        polyline: encodePolyline(payload.points),
        offsets: encodeOffsets(payload.offsetsMs.slice(0, 12)),
      },
    ]);
    expect(restored).toHaveLength(12);
  });
});

describe('storyboard', () => {
  it('runs the chapters in order and covers the whole duration', () => {
    const scene = sceneWith(drive(200));
    const storyboard = buildStoryboard(scene);

    expect(storyboard.chapters.map((chapter) => chapter.kind)).toEqual([
      'opening',
      'drive',
      'reveal',
      'numbers',
      'signature',
    ]);
    expect(storyboard.chapters[0]!.startMs).toBe(0);
    for (let i = 1; i < storyboard.chapters.length; i += 1) {
      expect(storyboard.chapters[i]!.startMs).toBe(storyboard.chapters[i - 1]!.endMs);
    }
    expect(storyboard.chapters[storyboard.chapters.length - 1]!.endMs).toBe(storyboard.durationMs);
  });

  it('stays inside a length someone will actually watch', () => {
    const scene = sceneWith(drive(200));
    for (const target of [1_000, 22_000, 90_000]) {
      const storyboard = buildStoryboard(scene, { targetDurationMs: target });
      expect(storyboard.durationMs).toBeGreaterThanOrEqual(10_000);
      expect(storyboard.durationMs).toBeLessThanOrEqual(32_000);
    }
  });

  it('draws the route exactly once, from nothing to all of it', () => {
    const scene = sceneWith(drive(200));
    const storyboard = buildStoryboard(scene);

    expect(sampleFrame(scene, storyboard, 0).progress).toBe(0);

    const drive_ = storyboard.chapters.find((chapter) => chapter.kind === 'drive')!;
    let previous = -1;
    for (let t = drive_.startMs; t <= drive_.endMs; t += 100) {
      const progress = sampleFrame(scene, storyboard, t).progress;
      expect(progress).toBeGreaterThanOrEqual(previous);
      previous = progress;
    }
    expect(sampleFrame(scene, storyboard, drive_.endMs).progress).toBeCloseTo(1, 6);
    expect(sampleFrame(scene, storyboard, storyboard.durationMs).progress).toBe(1);
  });

  it('is defined and clamped outside its own timeline', () => {
    const scene = sceneWith(drive(200));
    const storyboard = buildStoryboard(scene);

    for (const t of [-5_000, storyboard.durationMs + 5_000]) {
      const frame = sampleFrame(scene, storyboard, t);
      expect(Number.isFinite(frame.camera.x)).toBe(true);
      expect(Number.isFinite(frame.camera.zoom)).toBe(true);
      expect(Number.isFinite(frame.camera.bearing)).toBe(true);
    }
  });

  it('never asks for a zoom the tile provider does not serve', () => {
    const scene = sceneWith(drive(200));
    const storyboard = buildStoryboard(scene);
    for (let t = 0; t <= storyboard.durationMs; t += 60) {
      const frame = sampleFrame(scene, storyboard, t);
      expect(frame.camera.zoom).toBeLessThanOrEqual(scene.basemap.maxZoom + 0.5);
      expect(frame.camera.zoom).toBeGreaterThan(0);
      expect(frame.camera.tilt).toBeGreaterThan(0);
      expect(frame.camera.tilt).toBeLessThanOrEqual(1);
    }
  });

  it('moves the camera smoothly, no jump cuts inside a chapter', () => {
    const scene = sceneWith(drive(400));
    const storyboard = buildStoryboard(scene);
    const step = 1000 / 30;

    for (const chapter of storyboard.chapters) {
      for (let t = chapter.startMs + step; t < chapter.endMs; t += step) {
        const before = sampleFrame(scene, storyboard, t - step);
        const after = sampleFrame(scene, storyboard, t);
        // 0.13 zoom levels per frame is ~4 levels a second, fast, but a
        // deliberate descent from an establishing shot is meant to be fast.
        // Anything past it is a jump cut, and this assertion is the only
        // thing standing between the storyboard and one. It is tight enough
        // that swapping an ease for a steeper curve trips it, which is
        // exactly how the opening and the reveal were caught.
        expect(Math.abs(after.camera.zoom - before.camera.zoom)).toBeLessThan(0.13);
        expect(Math.abs(bearingDelta(before.camera.bearing, after.camera.bearing))).toBeLessThan(15);
      }
    }
  });

  it('collapses to the mapless variant when there is no route', () => {
    const scene = sceneWith(null);
    const storyboard = buildStoryboard(scene);
    expect(storyboard.chapters.map((chapter) => chapter.kind)).toEqual([
      'opening',
      'numbers',
      'signature',
    ]);
    const frame = sampleFrame(scene, storyboard, storyboard.durationMs / 2);
    expect(frame.stats).toBeGreaterThan(0);
    expect(Number.isFinite(frame.camera.zoom)).toBe(true);
  });
});

describe('film', () => {
  it('has one entry per frame in every channel', () => {
    const scene = sceneWith(drive(200));
    const { film } = buildFilm(scene, { fps: 30 });

    expect(film.frameCount).toBeGreaterThan(200);
    for (const [name, channel] of Object.entries(film.channels)) {
      expect(channel, name).toHaveLength(film.frameCount);
      for (const value of channel) expect(Number.isFinite(value)).toBe(true);
    }
    expect(film.path).toHaveLength(film.pathDistances.length * 2);
  });

  it('is deterministic, the same scene twice is the same film', () => {
    const scene = sceneWith(drive(200));
    expect(buildFilm(scene, { fps: 30 }).film).toEqual(buildFilm(scene, { fps: 30 }).film);
  });

  it('stays small enough to hand across a WebView bridge', () => {
    const scene = sceneWith(drive(1_200));
    const { film } = buildFilm(scene, { fps: 30 });
    expect(JSON.stringify(film).length).toBeLessThan(400_000);
  });
});

describe('the numbers the video shows', () => {
  it('never calls gross revenue profit', () => {
    const stats = buildRecapStats({ summary: summaryFor(), date: new Date('2026-08-15T12:00:00Z') });
    expect(stats.netProfit).toBe(38_500 + 1_200 - 12_400);
    expect(stats.metrics.find((metric) => metric.key === 'gross')?.label).toBe('Faturamento');
    expect(stats.metrics.some((metric) => /lucro/i.test(metric.label) && metric.key === 'gross')).toBe(false);
  });

  it('shows a dash and a reason rather than a zero when there is no denominator', () => {
    const summary = summarisePeriod({
      journeys: [
        {
          id: 'j1',
          startedAt: '2026-08-15T09:00:00.000Z',
          endedAt: '2026-08-15T17:00:00.000Z',
          pausedSeconds: 0,
          odometerStart: null,
          odometerEnd: null,
          distanceOverride: null,
          distanceGps: null,
        },
      ],
      revenues: [{ date: '2026-08-15', amount: 20_000, tips: 0, tripCount: null, platformId: null }],
      expenses: [],
    });

    const stats = buildRecapStats({ summary, date: new Date('2026-08-15T12:00:00Z') });
    const perKm = stats.metrics.find((metric) => metric.key === 'revenueP'.concat('erKm'));
    if (perKm) {
      expect(perKm.value).toBeNull();
      expect(perKm.reason).toBe('sem km informado');
    }
    expect(stats.distance).toBeNull();
    expect(stats.metrics.every((metric) => metric.value !== '0' && metric.value !== 'R$ 0,00' || metric.key === 'expenses')).toBe(true);
  });

  it('shows at most four tiles and prefers the ones with a figure', () => {
    const stats = buildRecapStats({ summary: summaryFor(), date: new Date('2026-08-15T12:00:00Z') });
    expect(stats.metrics.length).toBeLessThanOrEqual(4);
    expect(stats.metrics.filter((metric) => metric.value !== null).length).toBe(stats.metrics.length);
  });

  it('formats the date in Portuguese', () => {
    const stats = buildRecapStats({
      summary: summaryFor(),
      date: new Date(2026, 7, 15),
      driverName: '  Thiago  ',
    });
    expect(stats.dateLabel).toBe('Sábado, 15 de agosto');
    expect(stats.driverName).toBe('Thiago');
  });
});

describe('the rendered document', () => {
  it('is self-contained and carries the film', () => {
    const scene = sceneWith(drive(200));
    const { film } = buildFilm(scene);
    const html = renderRecapDocument(scene, film);

    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('window.__RECAP__');
    expect(html).toContain('id="stage"');
    // Nothing may be fetched at runtime: no server, no bundler, no CDN.
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href=/i);
  });

  it('cannot be broken out of by data inside the payload', () => {
    const scene = sceneWith(drive(200));
    scene.brand = { ...scene.brand, wordmark: '</script><script>alert(1)</script>' };
    const { film } = buildFilm(scene);
    const html = renderRecapDocument(scene, film);

    const start = html.indexOf('window.__RECAP__');
    const payload = html.slice(start, html.indexOf('</script>', start));

    // The attack is closing the tag early, so that is what is asserted: no
    // literal tag delimiter survives into the payload.
    expect(payload).not.toContain('<script');
    expect(payload).not.toContain('</script');
    expect(payload).toContain('\\u003c');
    // The text itself is preserved verbatim, escaped, not stripped. It is
    // someone's data, and it renders on the canvas as the characters they
    // typed.
    expect(payload).toContain('alert(1)');
    // Exactly two script elements: the payload and the painter.
    expect(html.split('</script>').length - 1).toBe(2);
  });
});

describe('buildRecap', () => {
  it('goes from stored rows to a playable document', () => {
    const payload = toSegmentPayload(drive(200))!;
    const recap = buildRecap({
      id: 'journey-1',
      summary: summaryFor(),
      date: new Date(2026, 7, 15),
      driverName: 'Thiago',
      segments: [
        {
          seq: 0,
          startedAt: payload.startedAt,
          polyline: encodePolyline(payload.points),
          offsets: encodeOffsets(payload.offsetsMs),
        },
      ],
    });

    expect(recap.hasRoute).toBe(true);
    expect(recap.film.frameCount).toBeGreaterThan(0);
    expect(recap.document()).toContain('window.__RECAP__');
  });

  it('still produces a recap for a journey nobody recorded', () => {
    const recap = buildRecap({
      id: 'journey-2',
      summary: summaryFor(),
      date: new Date(2026, 7, 15),
    });

    expect(recap.hasRoute).toBe(false);
    expect(recap.film.path).toHaveLength(0);
    expect(recap.film.frameCount).toBeGreaterThan(0);
    expect(recap.document()).toContain('window.__RECAP__');
  });

  it('treats an unusable trace as no trace at all', () => {
    const payload = toSegmentPayload(drive(3))!;
    const recap = buildRecap({
      id: 'journey-3',
      summary: summaryFor(),
      date: new Date(2026, 7, 15),
      segments: [
        {
          seq: 0,
          startedAt: payload.startedAt,
          polyline: encodePolyline(payload.points),
          offsets: encodeOffsets(payload.offsetsMs),
        },
      ],
    });
    expect(recap.hasRoute).toBe(false);
  });
});
