import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import type { LatLng } from '@dinamique/types';
import { cameraFor, useTheme } from '@dinamique/ui';
import { BASEMAP_ATTRIBUTION, HAS_BASEMAP, basemapStyleUrl } from './basemap';
import { RouteReplayShared, REPLAY_HEIGHT, type RouteReplayProps } from './RouteReplayShared';
import { RouteReplayTrace } from './RouteReplayTrace';
// The library's own stylesheet — controls, the (disabled) attribution box,
// canvas sizing. Safe as a bare top-level import: this file is the one Metro
// resolves only on the web, so it never reaches a native bundle to fail on.
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * The replay on the web — and the module TypeScript resolves everywhere.
 *
 * Metro prefers `RouteReplay.native.tsx` on a device; the compiler knows
 * nothing about platform extensions, so the bare file has to be a real module
 * it can typecheck. Making that file the web one is what keeps the native
 * MapLibre bridge (`@maplibre/maplibre-react-native`) out of the web
 * dependency graph structurally, rather than by a runtime `if` that a bundler
 * would still have to follow.
 *
 * The map itself, though, *is* shared: `maplibre-gl` is the plain JS/WebGL
 * library the native bridge wraps, has no native module of its own, and is
 * exactly what lets a browser show the same street map a phone does — Google
 * and Apple's web SDKs forbid drawing their tiles into an image somebody can
 * save, same as their native ones. CI's grep for stray native modules matches
 * `maplibre-react-native` specifically, not the bare word, precisely so this
 * file is allowed to use the library the native one is built on.
 *
 * The version is pinned to the 5.x line, and that is not conservatism. From
 * 6.0 the library stopped inlining its web worker and started loading it as a
 * sibling file resolved from `import.meta.url`, alongside a second shared
 * chunk. Metro emits neither: `import.meta.url` is not an http URL in a
 * bundle, so the worker URL comes out empty, `new Worker('')` fails, and the
 * map renders an empty canvas with no error anywhere — which is exactly what
 * shipped. 5.x carries the worker inside the bundle as a blob, which is what
 * every JS bundler has always been able to serve. Do not bump this to 6
 * without a plan for emitting those two files and setting
 * `maplibregl.config.WORKER_URL`.
 */
export function RouteReplay(props: RouteReplayProps) {
  const styleUrl = basemapStyleUrl();

  if (!HAS_BASEMAP || !styleUrl) return <DrawnReplay {...props} />;

  return <WebMapReplay {...props} styleUrl={styleUrl} />;
}

/**
 * The replay with no map under it: the traced line on the brand gradient.
 *
 * Reached two ways, and deliberately the same component for both. A checkout
 * with no key has never had a map, and a browser where the basemap failed to
 * load has just lost one — but the driver's day is the same day either way,
 * and a drawn route reads as the design rather than as breakage. A blank grey
 * panel is the one outcome that is never acceptable.
 */
function DrawnReplay(props: RouteReplayProps) {
  return (
    <RouteReplayShared
      {...props}
      attribution={null}
      renderTrack={(progress) => (
        <RouteReplayTrace
          points={props.points}
          progress={progress}
          height={props.height ?? REPLAY_HEIGHT}
        />
      )}
    />
  );
}

function lineString(points: readonly LatLng[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: points.map((p) => [p.lon, p.lat]) },
  };
}

/**
 * How long a basemap gets to appear before the replay stops waiting for it.
 *
 * Generous on purpose: this is a driver on mobile data, and a slow map is
 * still the map they want. But it is finite, because a refused key never
 * resolves at all and silence is the one thing the screen must not show.
 */
const MAP_LOAD_TIMEOUT_MS = 8_000;

/**
 * How far the camera leans over the route, in degrees.
 *
 * Flat on, a day's driving is a diagram. Leaning the camera over is what turns
 * it into a place: the streets converge towards the horizon, the buildings the
 * basemap draws get a face, and the line the driver covered reads as ground
 * rather than as ink. It is the difference people mean when they call one map
 * three-dimensional and another one flat.
 *
 * Not steeper: past about sixty the far end of a long route falls apart into
 * the horizon and the shape stops being readable, which is the whole point of
 * the replay.
 */
const MAP_PITCH = 52;

const WHOLE_SOURCE = 'route-whole';
const COVERED_SOURCE = 'route-covered';

/**
 * Owns the `maplibre-gl` instance. Split out from `RouteReplay` so the guard
 * above can return before any of this runs — the library's constructor talks
 * to the network the moment it is called, and a checkout with no key must
 * never make that call.
 */
function WebMapReplay(props: RouteReplayProps & { styleUrl: string }) {
  const theme = useTheme();
  const height = props.height ?? REPLAY_HEIGHT;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const camera = useMemo(() => cameraFor(props.points), [props.points]);

  // Mount once. Re-creating the map on every prop change would refetch every
  // tile for a route the driver is already watching.
  useEffect(() => {
    if (failed || !containerRef.current) return undefined;

    let disposed = false;
    let settled = false;
    // The basemap is a request to somebody else's server with a key on it, so
    // it can be refused: a key restricted to the wrong referrer, a privilege
    // never granted, a device with no WebGL. Every one of those used to end
    // as a grey rectangle with no explanation and no way back. A deadline
    // turns all of them into one outcome the driver can actually use.
    const deadline = setTimeout(() => {
      if (!settled && !disposed) {
        settled = true;
        setFailed(true);
      }
    }, MAP_LOAD_TIMEOUT_MS);

    function giveUp() {
      if (settled || disposed) return;
      settled = true;
      clearTimeout(deadline);
      setFailed(true);
    }

    // Loaded lazily, and only from this component: the whole point of keeping
    // it out of `RouteReplayShared` is that nothing outside a checkout with a
    // real key ever runs `new maplibregl.Map(...)`.
    void import('maplibre-gl')
      .then((maplibregl) => {
        if (disposed || !containerRef.current) return;
        const map = new maplibregl.Map({
          container: containerRef.current,
          style: props.styleUrl,
          // A day's route is something to watch, not to explore. The same
          // reasoning as the native replay disabling pan/zoom/rotate/pitch —
          // here it is one flag instead of four.
          interactive: false,
          // Set here rather than per camera move, so it survives every
          // `fitBounds` and `jumpTo` below without either of them restating it.
          pitch: MAP_PITCH,
          attributionControl: false,
        });
        mapRef.current = map;

        // Only before the style has loaded. After that a failed request is one
        // tile in one corner, and tearing the whole map down over it would be
        // a worse map than the one with a gap in it.
        map.on('error', () => {
          if (!settled) giveUp();
        });

        map.on('load', () => {
          if (disposed) return;
          settled = true;
          clearTimeout(deadline);
          // The canvas is sized from the container at construction. On the web
          // that container is laid out by flexbox and can settle a frame later
          // — a rotation, a keyboard, a scrollbar appearing — and a canvas
          // that missed it stays whatever size it was born at.
          map.resize();
          setReady(true);
        });
      })
      .catch(giveUp);

    return () => {
      disposed = true;
      clearTimeout(deadline);
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Deliberately not on `styleUrl` — it is derived from a build env var and
    // never changes while the app is running. `failed` is one-way, so this
    // only ever runs again to tear the map down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  // Keeps the canvas honest about its box for the life of the replay, not just
  // at load: the card sits in a scroll view that reflows.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const whole = lineString(props.points);
    if (map.getSource(WHOLE_SOURCE)) {
      (map.getSource(WHOLE_SOURCE) as import('maplibre-gl').GeoJSONSource).setData(whole as never);
    } else {
      map.addSource(WHOLE_SOURCE, { type: 'geojson', data: whole as never });
      map.addLayer({
        id: `${WHOLE_SOURCE}-line`,
        type: 'line',
        source: WHOLE_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': theme.colors.borderStrong, 'line-width': 5, 'line-opacity': 0.55 },
      });
      map.addSource(COVERED_SOURCE, {
        type: 'geojson',
        data: lineString(props.points.slice(0, 1)) as never,
      });
      map.addLayer({
        id: `${COVERED_SOURCE}-line`,
        type: 'line',
        source: COVERED_SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': theme.colors.brandPrimary, 'line-width': 6 },
      });
    }

    // A standstill has no box to fit — see `cameraFor`. Centring on the spot
    // at a fixed zoom is what shows the driver the street they were parked on
    // instead of a maximum-zoom blur.
    if (camera?.kind === 'bounds') {
      map.fitBounds([camera.bounds.sw, camera.bounds.ne], { padding: 48, duration: 0 });
    } else if (camera?.kind === 'centre') {
      map.jumpTo({ center: camera.centre, zoom: camera.zoom });
    }
  }, [camera, props.points, ready, theme.colors.borderStrong, theme.colors.brandPrimary]);

  // Not a hook-order problem: the effects above all no-op once `failed` is
  // set, and the map they owned has already been removed by their cleanup.
  if (failed) return <DrawnReplay {...props} />;

  return (
    <RouteReplayShared
      {...props}
      attribution={BASEMAP_ATTRIBUTION}
      renderTrack={(_progress, index) => (
        <View
          style={{
            height,
            borderRadius: theme.radius['2xl'],
            overflow: 'hidden',
            backgroundColor: theme.colors.backgroundSecondary,
          }}
        >
          {/* @ts-expect-error react-native-web forwards the ref to the underlying DOM node */}
          <View ref={containerRef} style={{ flex: 1 }} />
          {/* Mutates the map imperatively from an effect, never from this
              render — `setData` on a library object is not something React's
              render phase is allowed to touch, and `index` changes on almost
              every frame the animation runs. */}
          <CoveredLineUpdater map={mapRef.current} ready={ready} points={props.points} index={index} />
        </View>
      )}
    />
  );
}

/**
 * The only thing that runs every time the animation advances a step.
 *
 * A component rather than inline logic in `WebMapReplay` because `index`
 * arrives as an argument to `renderTrack`, not as this component's own state —
 * routing it through a child's props is what turns "the map changed" into a
 * dependency array an effect can actually react to.
 */
function CoveredLineUpdater({
  map,
  ready,
  points,
  index,
}: {
  map: import('maplibre-gl').Map | null;
  ready: boolean;
  points: readonly LatLng[];
  index: number;
}) {
  useEffect(() => {
    if (!map || !ready) return;
    const covered = map.getSource(COVERED_SOURCE) as
      | import('maplibre-gl').GeoJSONSource
      | undefined;
    covered?.setData(lineString(points.slice(0, Math.max(1, index + 1))) as never);
  }, [map, ready, points, index]);

  return null;
}

export type { RouteReplayProps };
