// The `/tokens` entry point, not the barrel: the barrel re-exports every
// component, and this module is imported by the headless background task,
// which must not drag react-native-svg and the whole design system into a
// context that has no renderer.
import { blue } from '@dinamique/ui/tokens';

/** The single background task name. Registered at module scope — see backgroundTask. */
export const LOCATION_TASK = 'dinamique-journey-location';

/** Storage keys. Chunked so a ten-hour shift never rewrites one big blob. */
export const ROUTE_KEY_PREFIX = '@dinamique/route';
export const activeRouteKey = () => `${ROUTE_KEY_PREFIX}/active`;
/** Set while capture is stopped on purpose, so recovery knows not to cry restart. */
export const deliberateStopKey = () => `${ROUTE_KEY_PREFIX}/stopped`;
export const routeMetaKey = (journeyId: string) => `${ROUTE_KEY_PREFIX}/${journeyId}/meta`;
export const routeChunkKey = (journeyId: string, chunk: number) =>
  `${ROUTE_KEY_PREFIX}/${journeyId}/${chunk}`;

/**
 * Fixes per stored chunk.
 *
 * Appending to one growing JSON array would mean rewriting the whole shift
 * every ten seconds for ten hours. Chunking makes an append O(chunk) instead of
 * O(shift), and 500 fixes is roughly 35 KB — well clear of the ~2 MB per-row
 * ceiling Android's SQLite-backed AsyncStorage imposes.
 */
export const ROUTE_CHUNK_SIZE = 500;

/** A buffer nobody claimed within this many days is abandoned; we drop it. */
export const ORPHAN_BUFFER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * How often we ask the OS for a position.
 *
 * 25 m / 10 s is the low end of what fitness apps use, and at that spacing a
 * 200 km shift is around 8 000 raw fixes — trivial to buffer, and simplification
 * cuts it to under a thousand before anything is uploaded. Deferred updates let
 * iOS batch and wake the app far less often than the interval suggests.
 */
export const GPS_DISTANCE_INTERVAL_M = 25;
export const GPS_TIME_INTERVAL_MS = 10_000;
export const GPS_DEFERRED_DISTANCE_M = 250;
export const GPS_DEFERRED_INTERVAL_MS = 30_000;

/**
 * Android's foreground service notification. Required for background location
 * on API 29+, and a promise to the driver that we are not hiding.
 *
 * The colour is imported rather than written as a hex literal: CI refuses any
 * raw hex under apps/mobile, and the design system is the source of truth for
 * what "Dinamique blue" means.
 */
export const FOREGROUND_SERVICE_NOTIFICATION = {
  notificationTitle: 'Jornada em andamento',
  notificationBody: 'O Dinamique está contando seus quilômetros.',
  notificationColor: blue[500],
} as const;
