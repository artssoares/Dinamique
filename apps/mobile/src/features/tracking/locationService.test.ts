import { beforeEach, describe, expect, it, vi } from 'vitest';

const appendFixes = vi.fn();
const beginRoute = vi.fn();
const clearDeliberateStop = vi.fn();
const markDeliberateStop = vi.fn();

vi.mock('./buffer', () => ({
  appendFixes: (...args: unknown[]) => appendFixes(...args),
  beginRoute: (...args: unknown[]) => beginRoute(...args),
  clearDeliberateStop: () => clearDeliberateStop(),
  markDeliberateStop: () => markDeliberateStop(),
}));

/** One position, shaped exactly as the browser hands it over. */
function position(lat: number, lon: number) {
  return {
    timestamp: 1_700_000_000_000,
    coords: { latitude: lat, longitude: lon, accuracy: 8, speed: 4.2 },
  };
}

let watchCallback: ((p: unknown) => void) | null = null;
let cleared: number[] = [];
let nextBrowserWatchId = 0;

beforeEach(async () => {
  vi.clearAllMocks();
  watchCallback = null;
  cleared = [];
  // Ids that do NOT start at 1. The shim this service replaced only worked
  // while the browser's watch id happened to match the one expo had
  // registered the callback under, which is true on a fresh page and false
  // from the second journey onwards — the exact reason the bug survived a
  // first test and lost every shift after it.
  nextBrowserWatchId = 41;

  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: (success: (p: unknown) => void) => {
        watchCallback = success;
        return (nextBrowserWatchId += 1);
      },
      clearWatch: (id: number) => cleared.push(id),
    },
  });
});

async function freshService() {
  vi.resetModules();
  return (await import('./locationService')).locationService;
}

describe('web capture', () => {
  it('buffers the positions the browser reports', async () => {
    const service = await freshService();
    await service.start('journey-1');

    expect(beginRoute).toHaveBeenCalledWith('journey-1');
    expect(watchCallback).not.toBeNull();

    watchCallback!(position(-23.5629, -46.6544));

    expect(appendFixes).toHaveBeenCalledTimes(1);
    const [journeyId, fixes] = appendFixes.mock.calls[0] as [string, unknown[]];
    expect(journeyId).toBe('journey-1');
    expect(fixes[0]).toEqual({
      t: 1_700_000_000_000,
      lat: -23.5629,
      lon: -46.6544,
      acc: 8,
      spd: 4.2,
    });
  });

  it('keeps counting the second journey of the same session', async () => {
    const service = await freshService();
    await service.start('journey-1');
    await service.stop();
    await service.start('journey-2');

    watchCallback!(position(-23.55, -46.63));

    // The whole point of the regression: an id that drifted away from the
    // one a subscriber registry expected used to silently drop every fix.
    expect(appendFixes).toHaveBeenCalledTimes(1);
    expect((appendFixes.mock.calls[0] as [string, unknown[]])[0]).toBe('journey-2');
  });

  it('asks the browser for real GPS rather than wifi positioning', async () => {
    let options: PositionOptions | undefined;
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: (_s: unknown, _e: unknown, o: PositionOptions) => {
          options = o;
          return 7;
        },
        clearWatch: () => undefined,
      },
    });

    const service = await freshService();
    await service.start('journey-1');

    // Without this the browser positions by wifi and cell, and every reading
    // lands outside MAX_ACCEPTABLE_ACCURACY_M.
    expect(options?.enableHighAccuracy).toBe(true);
    // A cached fix repeated across a shift reads as a driver who never moved.
    expect(options?.maximumAge).toBe(0);
  });

  it('survives a position error instead of tearing the watch down', async () => {
    let errorCallback: ((e: unknown) => void) | undefined;
    vi.stubGlobal('navigator', {
      geolocation: {
        watchPosition: (_s: unknown, e: (err: unknown) => void) => {
          errorCallback = e;
          return 9;
        },
        clearWatch: (id: number) => cleared.push(id),
      },
    });

    const service = await freshService();
    await service.start('journey-1');
    errorCallback?.({ code: 3, message: 'timeout' });

    // A tunnel is not the end of the shift.
    expect(cleared).toEqual([]);
    expect(await service.isTracking()).toBe(true);
  });

  it('stops watching when the journey stops', async () => {
    const service = await freshService();
    await service.start('journey-1');
    expect(await service.isTracking()).toBe(true);

    await service.stop();

    expect(cleared).toEqual([42]);
    expect(await service.isTracking()).toBe(false);
    expect(markDeliberateStop).toHaveBeenCalled();
  });

  it('never claims to count with the tab closed', async () => {
    const service = await freshService();
    expect(service.supportsBackground).toBe(false);
  });
});
