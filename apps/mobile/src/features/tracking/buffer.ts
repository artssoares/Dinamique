import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  acceptFix,
  haversineMetres,
  MAX_MOVING_SEGMENT_S,
  MIN_FIXES_FOR_GPS_DISTANCE,
  MIN_GPS_DISTANCE_M,
  type Fix,
} from '@dinamique/business-logic';
import {
  activeRouteKey,
  deliberateStopKey,
  ORPHAN_BUFFER_MAX_AGE_MS,
  ROUTE_CHUNK_SIZE,
  ROUTE_KEY_PREFIX,
  routeChunkKey,
  routeMetaKey,
} from './constants';

/**
 * The point buffer: where a shift lives before it is worth uploading.
 *
 * Nothing is sent while the driver is working. A whole day of positions is a
 * few hundred kilobytes on a mobile plan the driver pays for, and the only
 * thing anyone needs from it is one number and one shape at the end.
 *
 * The buffer is deleted only after the journey row has been updated. If the
 * upload fails — no signal in a garage, app killed mid-save — the day survives
 * and the next app open finishes the job.
 */

interface RouteMeta {
  journeyId: string;
  chunkCount: number;
  fixCount: number;
  startedAt: number;
  updatedAt: number;
  /**
   * Running distance and the last fix it was measured from.
   *
   * Kept here so the live figure on the journey card is a single key read.
   * Re-summarising the whole shift every twenty seconds would mean parsing
   * half a megabyte and running Douglas-Peucker over it by hour eight — on the
   * phone of someone who is driving.
   *
   * `acceptFix` is the same predicate `filterFixes` applies, one fix at a
   * time, so this agrees with the figure the shift is finally saved with.
   */
  distanceM?: number;
  lastAccepted?: Fix | null;
  /** Fixes that survived the filter, for the same minimum `summariseTrack` uses. */
  acceptedCount?: number;
  /**
   * Instants at which capture restarted.
   *
   * The close recomputes the whole shift from the raw fixes, where a
   * deliberate stop is indistinguishable from an ordinary pause between
   * readings unless we say so. Ninety seconds is long enough to drive
   * somewhere and short enough to slip under any length-based rule.
   */
  breaks?: number[];
}

/** Which journey the background task should be writing into, if any. */
export interface ActiveRoute {
  journeyId: string;
  startedAt: number;
}

/**
 * Reads a key, and never confuses "there is nothing here" with "I could not
 * look".
 *
 * That distinction is the whole safety property of this module. A storage read
 * that failed used to come back as `null`, which every caller treated as an
 * empty buffer: the appender would start a fresh chunk 0 over a shift already
 * in progress, and the close screen would decide there was nothing to keep and
 * release chunks that were intact on disk. Both silently threw away a day.
 *
 * Absent returns `null`. Unreadable and unparseable throw, and the callers
 * decide — which for anything holding a driver's shift means doing nothing.
 */
async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

export async function getActiveRoute(): Promise<ActiveRoute | null> {
  return readJson<ActiveRoute>(activeRouteKey());
}

/**
 * Records that capture stopped because we asked it to.
 *
 * The close wizard stops the feed the moment it opens, and the settings screen
 * stops it on a toggle. Without a note of that, the recovery path sees a
 * journey with a buffer and no running task, concludes the device restarted,
 * and tells the driver kilometres may be missing — about a stop it made
 * itself. Cleared whenever capture starts again.
 */
export async function markDeliberateStop(): Promise<void> {
  await AsyncStorage.setItem(deliberateStopKey(), '1').catch(() => undefined);
}

export async function clearDeliberateStop(): Promise<void> {
  await AsyncStorage.removeItem(deliberateStopKey()).catch(() => undefined);
}

export async function wasDeliberateStop(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(deliberateStopKey()).catch(() => null);
  return raw !== null;
}

const generations = new Map<string, number>();

function generationOf(journeyId: string): number {
  return generations.get(journeyId) ?? 0;
}

/** Invalidates work queued for one journey, leaving every other shift alone. */
function bumpGeneration(journeyId: string): void {
  generations.set(journeyId, generationOf(journeyId) + 1);
}

/** True while a wipe is in progress; every append is refused for its duration. */
let wiping = false;

/**
 * Serialises everything that read-modify-writes the meta.
 *
 * The OS delivers location batches whenever it likes, and two overlapping
 * read-modify-writes lose one of them. A rejection is contained so it cannot
 * poison the work queued behind it.
 */
let appendChain: Promise<void> = Promise.resolve();

function enqueue(work: () => Promise<void>): Promise<void> {
  const next = appendChain.then(work, work);
  appendChain = next.catch(() => undefined);
  return next;
}

/**
 * Opens the buffer for a journey, or reopens one that is already going.
 *
 * Reopening matters more than it looks: a device restart unregisters the
 * location task, and picking the shift back up calls straight through here. If
 * this reset the counters, the recovery would throw away every kilometre
 * recorded before the reboot — turning a gap of a few minutes into the loss of
 * a whole morning.
 */
export function beginRoute(journeyId: string): Promise<void> {
  // Queued behind the appends rather than racing them. This read-modify-writes
  // the meta, and a straggler batch landing after it would overwrite the break
  // instant just recorded and restore the pre-break `lastAccepted`.
  return enqueue(() => beginRouteSerially(journeyId));
}

async function beginRouteSerially(journeyId: string): Promise<void> {
  const now = Date.now();
  const existing = await readJson<RouteMeta>(routeMetaKey(journeyId));
  const meta: RouteMeta = existing
    ? // `lastAccepted` is dropped, the totals are kept. Capture only reopens
      // after a gap — a pause, a reboot, a settings toggle — and carrying the
      // last fix across it would add the straight line between where the
      // driver stopped and where they started again.
      {
        ...existing,
        updatedAt: now,
        lastAccepted: null,
        breaks: [...(existing.breaks ?? []), now],
      }
    : { journeyId, chunkCount: 0, fixCount: 0, startedAt: now, updatedAt: now };

  await AsyncStorage.multiSet([
    [
      activeRouteKey(),
      JSON.stringify({ journeyId, startedAt: meta.startedAt } satisfies ActiveRoute),
    ],
    [routeMetaKey(journeyId), JSON.stringify(meta)],
  ]);
}

export function appendFixes(journeyId: string, fixes: readonly Fix[]): Promise<void> {
  if (fixes.length === 0 || wiping) return Promise.resolve();
  const generation = generationOf(journeyId);

  return enqueue(() =>
    generation === generationOf(journeyId) && !wiping
      ? appendFixesSerially(journeyId, fixes)
      : Promise.resolve(),
  );
}

async function appendFixesSerially(journeyId: string, fixes: readonly Fix[]): Promise<void> {
  // Throws if the meta cannot be read. Falling back to a blank one would
  // rewrite chunk 0 over a shift in progress, orphan every chunk after it and
  // zero the running distance — losing the day rather than one batch of fixes.
  const meta = (await readJson<RouteMeta>(routeMetaKey(journeyId))) ?? {
    journeyId,
    chunkCount: 0,
    fixCount: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  let chunkIndex = Math.max(0, meta.chunkCount - 1);
  let tail: Fix[] = [];

  if (meta.chunkCount > 0) {
    // Read raw, so a storage failure and a corrupt value can be told apart.
    // Swallowing both and starting from an empty tail would have rewritten
    // this chunk over as many as 500 buffered fixes.
    const raw = await AsyncStorage.getItem(routeChunkKey(journeyId, chunkIndex));
    try {
      tail = raw === null ? [] : (JSON.parse(raw) as Fix[]);
    } catch {
      // Corrupt: that slice of the line is gone either way. Opening the next
      // index keeps the damage to one chunk instead of overwriting it.
      chunkIndex += 1;
      tail = [];
    }
  }

  const writes: Array<[string, string]> = [];
  let distanceM = meta.distanceM ?? 0;
  let lastAccepted = meta.lastAccepted ?? null;
  let acceptedCount = meta.acceptedCount ?? 0;

  for (const fix of fixes) {
    if (tail.length >= ROUTE_CHUNK_SIZE) {
      writes.push([routeChunkKey(journeyId, chunkIndex), JSON.stringify(tail)]);
      chunkIndex += 1;
      tail = [];
    }
    tail.push(fix);

    // Every raw fix is kept — the authoritative summary at close re-runs the
    // filter over all of them. This only advances the live figure.
    if (acceptFix(lastAccepted, fix)) {
      // The same gap rule the close applies. A stop and start already clears
      // `lastAccepted`, but a tunnel does not, and the straight line out the
      // far side is not ground anyone drove under this clock.
      const gap = lastAccepted ? (fix.t - lastAccepted.t) / 1000 : 0;
      if (lastAccepted && gap <= MAX_MOVING_SEGMENT_S) {
        distanceM += haversineMetres(lastAccepted, fix);
      }
      lastAccepted = fix;
      acceptedCount += 1;
    }
  }

  writes.push([routeChunkKey(journeyId, chunkIndex), JSON.stringify(tail)]);
  writes.push([
    routeMetaKey(journeyId),
    JSON.stringify({
      ...meta,
      chunkCount: chunkIndex + 1,
      fixCount: meta.fixCount + fixes.length,
      updatedAt: Date.now(),
      distanceM,
      lastAccepted,
      acceptedCount,
      breaks: meta.breaks ?? [],
    } satisfies RouteMeta),
  ]);

  await AsyncStorage.multiSet(writes);
}

/**
 * Reads the whole shift back, in order. Called once, at close.
 *
 * Throws if the meta cannot be read, rather than reporting an empty shift.
 * "Empty" is what tells the caller it is safe to delete the buffer, and a
 * storage hiccup is not a reason to erase a day off someone's phone.
 */
export async function readRoute(journeyId: string): Promise<Fix[]> {
  const meta = await readJson<RouteMeta>(routeMetaKey(journeyId));
  if (!meta || meta.chunkCount === 0) return [];

  const keys = Array.from({ length: meta.chunkCount }, (_, i) => routeChunkKey(journeyId, i));
  const pairs = await AsyncStorage.multiGet(keys);

  const fixes: Fix[] = [];
  for (const [, raw] of pairs) {
    if (!raw) continue;
    try {
      fixes.push(...(JSON.parse(raw) as Fix[]));
    } catch {
      // Skip the corrupt chunk; the rest of the day is still a route.
    }
  }
  return fixes;
}

/** When capture restarted during this shift. Empty when it never did. */
export async function readBreaks(journeyId: string): Promise<number[]> {
  const meta = await readJson<RouteMeta>(routeMetaKey(journeyId));
  return meta?.breaks ?? [];
}

/**
 * The live figure, as one key read. Null until the track is worth believing.
 *
 * Applies both minimums `summariseTrack` applies, and for the same reason: a
 * sparse track showing counted kilometres all shift and then reporting nothing
 * at close would look like the app losing the driver's day.
 */
export async function liveDistance(journeyId: string): Promise<number | null> {
  // Only a display figure, so an unreadable meta is a dash, not an error.
  const meta = await readJson<RouteMeta>(routeMetaKey(journeyId)).catch(() => null);
  if (!meta?.distanceM) return null;
  if ((meta.acceptedCount ?? 0) < MIN_FIXES_FOR_GPS_DISTANCE) return null;
  return meta.distanceM >= MIN_GPS_DISTANCE_M ? Math.round(meta.distanceM) : null;
}

/**
 * Removes every trace of one journey from the device.
 *
 * Deliberately enumerates the real keys rather than trusting the meta's chunk
 * count. A meta that went missing or failed to parse would otherwise leave the
 * chunks behind — raw timestamped positions with nothing pointing at them, so
 * `pruneOrphanBuffers` could never find them either.
 */
export function clearRoute(journeyId: string): Promise<void> {
  // The queue orders what is already waiting; the generation bump refuses what
  // arrives afterwards. Per journey, not global: a single counter meant
  // releasing one shift's buffer silently discarded batches already queued for
  // the shift still being driven, and the OS never re-delivers them.
  bumpGeneration(journeyId);
  return enqueue(() => clearRouteSerially(journeyId));
}

async function clearRouteSerially(journeyId: string): Promise<void> {
  const prefix = `${ROUTE_KEY_PREFIX}/${journeyId}/`;
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));

  const active = await getActiveRoute();
  if (active?.journeyId === journeyId) keys.push(activeRouteKey());

  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}

/**
 * Wipes every buffered route on the device, except the shift being driven.
 *
 * "Apagar todos os meus trajetos" has to mean the phone too — deleting only the
 * server rows would leave the rawest form of the data on the device the driver
 * was holding when they asked for it to be gone. But the open shift is spared:
 * the confirmation promises the kilometres are untouched, and wiping its fixes
 * would take today's measurement away with the old drawings.
 */
export async function clearAllRoutes(keepJourneyId: string | null = null): Promise<void> {
  // Closed for the duration, not just invalidated at the start. An append
  // entering while the wipe enumerates keys would otherwise write after
  // `getAllKeys()` had already looked.
  wiping = true;
  try {
    await appendChain.catch(() => undefined);

    const kept = keepJourneyId ? `${ROUTE_KEY_PREFIX}/${keepJourneyId}/` : null;
    const keys = (await AsyncStorage.getAllKeys()).filter(
      (key) => key.startsWith(`${ROUTE_KEY_PREFIX}/`) && !(kept && key.startsWith(kept)),
    );
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
  } finally {
    for (const journeyId of generations.keys()) {
      if (journeyId !== keepJourneyId) bumpGeneration(journeyId);
    }
    wiping = false;
  }
}

/**
 * Drops buffers nobody came back for.
 *
 * A journey whose close never completed leaves its points behind on purpose —
 * that is the retry. But a buffer still sitting there a week later belongs to a
 * journey that is never going to be closed, and keeping someone's movements
 * around indefinitely for a retry that will not happen is not a trade we make.
 */
export async function pruneOrphanBuffers(keepJourneyId: string | null): Promise<void> {
  const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  const ours = keys.filter((key) => key.startsWith(`${ROUTE_KEY_PREFIX}/`));
  if (ours.length === 0) return;

  // The caller may not know yet which journey is open — this runs on mount,
  // before the journey has loaded — so the active-route key is consulted
  // directly. Deleting the buffer of a shift in progress is not a trade-off
  // worth making for tidiness.
  const active = await getActiveRoute().catch(() => null);
  const cutoff = Date.now() - ORPHAN_BUFFER_MAX_AGE_MS;

  const protectedIds = new Set<string>();
  if (keepJourneyId) protectedIds.add(keepJourneyId);
  // The active key survives a close that skipped the release, and protecting
  // it unconditionally would exempt that buffer from the sweep for good. It is
  // protected while it is recent, which is what "being driven" actually means.
  if (active && active.startedAt >= cutoff) protectedIds.add(active.journeyId);

  const seen = new Set<string>();
  for (const key of ours) {
    const rest = key.slice(`${ROUTE_KEY_PREFIX}/`.length);
    // A journey's keys always carry a second segment — `/meta` or a chunk
    // index. Anything without one is a sentinel (`active`, `stopped`), and
    // treating those as journey ids would run `clearRoute` on them every sweep.
    if (!rest.includes('/')) continue;
    const journeyId = rest.split('/')[0];
    if (journeyId) seen.add(journeyId);
  }

  for (const journeyId of seen) {
    if (protectedIds.has(journeyId)) continue;

    let meta: RouteMeta | null = null;
    try {
      meta = await readJson<RouteMeta>(routeMetaKey(journeyId));
    } catch {
      // Unreadable rather than absent: leave it. A sweep is not worth
      // deleting a shift over, and the next one can try again.
      continue;
    }

    // Chunks with no meta at all can never be read back — reassembly is driven
    // by the meta's chunk count — so they are raw positions that would
    // otherwise sit on the device for good, invisible to this very sweep.
    if (!meta || meta.updatedAt < cutoff) {
      await clearRoute(journeyId).catch(() => undefined);
    }
  }
}
