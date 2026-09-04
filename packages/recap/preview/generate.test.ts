import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { summarisePeriod } from '@dinamique/business-logic';
import { decodePolyline } from '@dinamique/utils';
import { buildRecap, ESRI_WORLD_IMAGERY, fixesFromRoute } from '../src/index';
import { DEMO_POLYLINE, DEMO_PRECISION } from './demoRoute';

/**
 * Not a test: the preview tool. It lives outside `src` and outside the glob
 * CI runs, because it writes a file and asserts nothing. It exists because a
 * canvas cannot claim to be beautiful; the only way to judge a change to the
 * choreography is to look at it.
 *
 *   pnpm --filter @dinamique/recap run preview
 *   PREVIEW_TILES= pnpm --filter @dinamique/recap run preview   # no basemap
 *
 * Open the file in a browser. `window.recap.seek(n)` holds any frame and
 * `window.recap.record()` runs the real export path.
 *
 * The journey is the demo one from the database, read through the same
 * adapter the app uses (`fixesFromRoute`), so what appears here is what a
 * person testing in the app sees on Histórico.
 */
it('writes the preview of the demo journey', () => {
  const startedAt = '2026-09-04T09:12:00.000Z';
  const endedAt = '2026-09-04T13:28:05.000Z';
  const date = '2026-09-04';

  const summary = summarisePeriod({
    journeys: [
      {
        id: 'demo',
        startedAt,
        endedAt,
        pausedSeconds: 1740,
        odometerStart: null,
        odometerEnd: null,
        distanceOverride: 33019,
        distanceGps: 33019,
      },
    ],
    revenues: [
      { date, amount: 24680, tips: 1850, tripCount: 17, platformId: null },
      { date, amount: 16240, tips: 920, tripCount: 11, platformId: null },
    ],
    expenses: [
      { date, amount: 11800, isVehicleCost: true },
      { date, amount: 3200, isVehicleCost: false },
      { date, amount: 1560, isVehicleCost: true },
    ],
  });

  const points = decodePolyline(DEMO_POLYLINE, DEMO_PRECISION);
  const fixes = fixesFromRoute({
    points,
    startedAt,
    endedAt,
    workedSeconds: summary.workedSeconds,
  });

  const tiles = process.env.PREVIEW_TILES;
  const basemap =
    tiles === undefined
      ? ESRI_WORLD_IMAGERY
      : tiles.trim() === ''
        ? undefined
        : {
            urlTemplate: tiles,
            attribution: process.env.PREVIEW_ATTR ?? null,
            tileSize: 256,
            maxZoom: 19,
          };

  const recap = buildRecap({
    id: 'demo',
    summary,
    date: new Date(2026, 8, 4),
    driverName: 'Arthur',
    fixes,
    basemap,
  });

  const out = process.env.PREVIEW_OUT ?? '/tmp/preview.html';
  writeFileSync(out, recap.document({ loop: true }));
  console.log(
    'lucro', summary.netProfit,
    'km', summary.distance,
    'horas', (summary.workedSeconds / 3600).toFixed(2),
    'pontos', points.length,
    'hasRoute', recap.hasRoute,
    'duracao_ms', recap.film.durationMs,
    '->', out,
  );
});
