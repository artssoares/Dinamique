import type { RecapMessage } from '@dinamique/recap';

/**
 * The queue of films being made into files, and the files already made.
 *
 * The video used to be made only when the driver pressed Compartilhar: the
 * full screen opened, a second copy of the film was painted at file size
 * while they watched, and only then did the share sheet appear. The film was
 * watched twice, once to see it and once to wait for it.
 *
 * Now the file is made as soon as a journey's film is on screen, in the
 * background, and what plays is the file itself. By the time the driver
 * reaches for Compartilhar the sheet opens at once, with the exact video
 * they just watched in it.
 *
 * This module is the bookkeeping, with no React Native in it so it can be
 * tested: which film is being made, which are waiting, how far along each
 * is, and where the finished files are. Storage comes in through `FilmIo`,
 * the device's cache directory on a phone and Cache Storage in a browser.
 * The page that does the painting is mounted once, by `FilmBakeHost`, for
 * whichever film is at the head of the queue.
 *
 * One film at a time, on purpose. Painting and encoding share the page's
 * thread and the phone's encoder; two at once makes both slower than one
 * after the other, and the one the driver is looking at is the one that
 * matters.
 */

export type BakeStatus =
  /** Looking in the cache. */
  | 'checking'
  /** Waiting for another film to finish. */
  | 'queued'
  | 'baking'
  | 'ready'
  /** This device cannot encode frame by frame; the app uses the old flow. */
  | 'unsupported'
  | 'failed';

/** A finished file. */
export interface BakedFilm {
  /** A `file://` path on a phone, a blob URL in a browser. */
  uri: string;
  mime: string;
  /** Browser only: what `navigator.share` takes. */
  file?: File;
}

export interface BakeState {
  status: BakeStatus;
  /** 0 to 1, across the whole job: the map, the frames and the hand-over. */
  progress: number;
  baked: BakedFilm | null;
  error: string | null;
  errorCode: string | null;
}

export interface FilmIo {
  /** The file for this key, if it was made before. */
  load: (key: string) => Promise<BakedFilm | null>;
  /** Keeps the file, and drops older versions of the same journey's film. */
  save: (key: string, base64: string, mime: string) => Promise<BakedFilm>;
}

/** What the host needs to mount the page that makes the active film. */
export interface BakeJob<TRecap> {
  key: string;
  recap: TRecap;
}

/**
 * How the phases of a job add up to one progress figure. The frames are
 * almost all of the work once the map is in; the hand-over is short.
 */
const PHASE_SPAN = {
  tiles: [0, 0.15],
  render: [0.15, 0.92],
  encode: [0.92, 1],
} as const;

function within(phase: keyof typeof PHASE_SPAN, value: number): number {
  const [from, to] = PHASE_SPAN[phase];
  const clamped = Math.min(1, Math.max(0, value));
  return from + (to - from) * clamped;
}

/** Codes that mean the device cannot do this at all, not that this try failed. */
const UNSUPPORTED_CODES = new Set(['no-encoder', 'unsupported']);

/**
 * A page that stops talking is a page that hung: a tile server holding a
 * request, an encoder that never flushed. The export used to be watched, so
 * a hang was visible; in the background it would sit at 40% for ever.
 */
export const BAKE_SILENCE_MS = 45_000;

const IDLE: BakeState = {
  status: 'checking',
  progress: 0,
  baked: null,
  error: null,
  errorCode: null,
};

export interface Bakery<TRecap> {
  /** Asks for a film to be made, or found. Idempotent per key. */
  request: (key: string, recap: TRecap, options?: { urgent?: boolean }) => void;
  /** Moves a waiting film to the front: the driver is looking at it. */
  prioritise: (key: string) => void;
  /** Tries a failed film again. */
  retry: (key: string) => void;
  /** Everything the page that makes the active film says. */
  handleMessage: (key: string, message: RecapMessage) => void;
  state: (key: string) => BakeState;
  active: () => BakeJob<TRecap> | null;
  subscribe: (listener: () => void) => () => void;
}

export function createBakery<TRecap>(io: FilmIo): Bakery<TRecap> {
  const states = new Map<string, BakeState>();
  const recaps = new Map<string, TRecap>();
  const waiting: string[] = [];
  const listeners = new Set<() => void>();
  let current: string | null = null;
  /** The job object handed out by `active()`, the same one until it changes. */
  let job: BakeJob<TRecap> | null = null;
  /** Once one film reports that the device cannot encode, none will. */
  let unsupported = false;
  /** The base64 pieces of the active film, outside any state. */
  let chunks: string[] = [];
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function set(key: string, patch: Partial<BakeState>): void {
    states.set(key, { ...(states.get(key) ?? IDLE), ...patch });
    emit();
  }

  function armWatchdog(key: string): void {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      if (current === key) {
        finish(key, {
          status: 'failed',
          error: 'A montagem do vídeo parou de responder.',
          errorCode: 'timeout',
        });
      }
    }, BAKE_SILENCE_MS);
  }

  function pump(): void {
    if (current !== null) return;
    const next = waiting.shift();
    if (next === undefined) return;
    current = next;
    const recap = recaps.get(next);
    job = recap === undefined ? null : { key: next, recap };
    chunks = [];
    set(next, { status: 'baking', progress: 0 });
    armWatchdog(next);
  }

  function finish(key: string, patch: Partial<BakeState>): void {
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    chunks = [];
    if (current === key) {
      current = null;
      job = null;
    }
    // The page and the film it was made from are no longer needed once there
    // is a file, or once the device has said it cannot make one. A failed
    // try keeps them, so it can be tried again.
    if (patch.status !== 'failed') recaps.delete(key);
    set(key, patch);
    pump();
  }

  function enqueue(key: string, urgent: boolean): void {
    if (unsupported) {
      set(key, { status: 'unsupported' });
      return;
    }
    if (current === key || waiting.includes(key)) return;
    if (urgent) waiting.unshift(key);
    else waiting.push(key);
    set(key, { status: 'queued', progress: 0, error: null, errorCode: null });
    pump();
  }

  function request(key: string, recap: TRecap, options: { urgent?: boolean } = {}): void {
    const known = states.get(key);
    if (known) {
      if (options.urgent) prioritise(key);
      return;
    }
    recaps.set(key, recap);
    set(key, { ...IDLE });

    io.load(key).then(
      (baked) => {
        if (baked) {
          recaps.delete(key);
          set(key, { status: 'ready', progress: 1, baked });
          return;
        }
        enqueue(key, options.urgent === true);
      },
      () => enqueue(key, options.urgent === true),
    );
  }

  function prioritise(key: string): void {
    const at = waiting.indexOf(key);
    if (at <= 0) return;
    waiting.splice(at, 1);
    waiting.unshift(key);
  }

  function retry(key: string): void {
    const known = states.get(key);
    if (!known || known.status !== 'failed' || !recaps.has(key)) return;
    enqueue(key, true);
  }

  function handleMessage(key: string, message: RecapMessage): void {
    if (current !== key) return;
    armWatchdog(key);

    switch (message.type) {
      case 'progress':
        set(key, { progress: within(message.phase, message.value) });
        return;

      case 'begin':
        chunks = [];
        set(key, { progress: within('encode', 0) });
        return;

      case 'chunk':
        chunks[message.index] = message.data;
        set(key, { progress: within('encode', (message.index + 1) / message.total) });
        return;

      case 'done': {
        const expected = message.chunks ?? chunks.length;
        const received = chunks.filter((chunk) => typeof chunk === 'string').length;
        if (expected === 0 || received < expected) {
          // A missing piece is a file that opens and shows garbage.
          finish(key, {
            status: 'failed',
            error: 'A transferência do vídeo ficou incompleta.',
            errorCode: 'incomplete',
          });
          return;
        }
        const base64 = chunks.join('');
        chunks = [];
        io.save(key, base64, message.mime).then(
          (baked) => finish(key, { status: 'ready', progress: 1, baked }),
          () =>
            finish(key, {
              status: 'failed',
              error: 'Não foi possível guardar o vídeo.',
              errorCode: 'write',
            }),
        );
        return;
      }

      case 'error':
        if (UNSUPPORTED_CODES.has(message.code)) {
          unsupported = true;
          // Everything waiting would fail the same way.
          for (const waitingKey of waiting.splice(0)) set(waitingKey, { status: 'unsupported' });
          finish(key, { status: 'unsupported', errorCode: message.code });
          return;
        }
        finish(key, { status: 'failed', error: message.message, errorCode: message.code });
        return;

      default:
        return;
    }
  }

  return {
    request,
    prioritise,
    retry,
    handleMessage,
    state: (key) => states.get(key) ?? IDLE,
    active: () => job,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * A short fingerprint of the film's page.
 *
 * The page carries everything the film shows: the route, the figures, the
 * name, the map. If any of it changes (an expense added to the day, a name
 * edited), the fingerprint changes and the cached file is not reused. FNV-1a,
 * because this only has to tell versions of one journey's film apart.
 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** The cache key for one journey's film. The journey id leads, for cleanup. */
export function bakeKey(journeyId: string, document: string): string {
  return `${journeyId}-${fingerprint(document)}`;
}
