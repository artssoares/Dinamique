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
 */
export function RouteReplay(props: RouteReplayProps) {
  const styleUrl = basemapStyleUrl();

  if (!HAS_BASEMAP || !styleUrl) {
    return (
      <RouteReplayShared
        {...props}
        attribution={null}
        renderTrack={(progress) => (
          <RouteReplayTrace
            points={props.points}
            progress={progress}
            height={props.height ?? 260}
          />
        )}
      />
    );
  }

  return <WebMapReplay {...props} styleUrl={styleUrl} />;
}

function lineString(points: readonly LatLng[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: points.map((p) => [p.lon, p.lat]) },
  };
}

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
  const camera = useMemo(() => cameraFor(props.points), [props.points]);

  // Mount once. Re-creating the map on every prop change would refetch every
  // tile for a route the driver is already watching.
  useEffect(() => {
    if (!containerRef.current) return undefined;

    let disposed = false;
    // Loaded lazily, and only from this component: the whole point of keeping
    // it out of `RouteReplayShared` is that nothing outside a checkout with a
    // real key ever runs `new maplibregl.Map(...)`.
    void import('maplibre-gl').then((maplibregl) => {
      if (disposed || !containerRef.current) return;
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: props.styleUrl,
        // A day's route is something to watch, not to explore. The same
        // reasoning as the native replay disabling pan/zoom/rotate/pitch —
        // here it is one flag instead of four.
        interactive: false,
        attributionControl: false,
      });
      mapRef.current = map;
      map.on('load', () => {
        if (disposed) return;
        setReady(true);
      });
    });

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Deliberately only on mount/unmount — `styleUrl` is derived from a build
    // env var and never changes while the app is running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
