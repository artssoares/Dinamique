import { useMemo } from 'react';
import { View } from 'react-native';
import { Camera, LineLayer, MapView, ShapeSource } from '@maplibre/maplibre-react-native';
import type { LatLng } from '@dinamique/types';
import { cameraFor, useTheme } from '@dinamique/ui';
import { BASEMAP_ATTRIBUTION, HAS_BASEMAP, basemapStyleUrl } from './basemap';
import { RouteReplayShared, REPLAY_HEIGHT, type RouteReplayProps } from './RouteReplayShared';
import { RouteReplayTrace } from './RouteReplayTrace';

/** Room around the route so the ends are not welded to the edge of the map. */
const CAMERA_PADDING = 48;

function lineString(points: readonly LatLng[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: points.map((point) => [point.lon, point.lat]),
    },
  };
}

/**
 * The replay on a phone: the driver's day drawn over a real street map.
 *
 * MapLibre rather than the platform SDKs, and the reason is not aesthetic —
 * both Google's and Apple's terms forbid rendering their tiles into an image
 * somebody can save and post, which is the whole point of the share button two
 * screens along. MapLibre with Esri's basemap is also pixel-identical on iOS
 * and Android, so there is one replay to design rather than two.
 *
 * With no basemap key this falls back to the very same drawn line the web
 * shows. A missing key is a plainer replay, never a broken screen — and the
 * fallback is the tested path on every checkout that has no Esri account.
 */
export function RouteReplay(props: RouteReplayProps) {
  const theme = useTheme();
  const height = props.height ?? REPLAY_HEIGHT;
  const styleUrl = basemapStyleUrl();

  const whole = useMemo(() => lineString(props.points), [props.points]);
  const camera = useMemo(() => cameraFor(props.points), [props.points]);

  if (!HAS_BASEMAP || !styleUrl) {
    return (
      <RouteReplayShared
        {...props}
        attribution={null}
        renderTrack={(progress) => (
          <RouteReplayTrace points={props.points} progress={progress} height={height} />
        )}
      />
    );
  }

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
          <MapView
            style={{ flex: 1 }}
            mapStyle={styleUrl}
            // A day's route is something to watch, not to explore. Panning it
            // mid-replay loses the shape and gains nothing; full-screen
            // exploration is a separate screen if we ever want it.
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            // Ours is rendered in the shared chrome, where it stays legible
            // over any part of the map.
            attributionEnabled={false}
            logoEnabled={false}
          >
            {/* A standstill has no box to fit — see `cameraFor`. Centring on
                the spot shows the street the driver was parked on; fitting a
                zero-area box shows a maximum-zoom blur. */}
            {camera?.kind === 'bounds' ? (
              <Camera
                bounds={{ ne: camera.bounds.ne, sw: camera.bounds.sw }}
                padding={{
                  paddingTop: CAMERA_PADDING,
                  paddingBottom: CAMERA_PADDING,
                  paddingLeft: CAMERA_PADDING,
                  paddingRight: CAMERA_PADDING,
                }}
                animationDuration={0}
              />
            ) : camera?.kind === 'centre' ? (
              <Camera
                centerCoordinate={camera.centre}
                zoomLevel={camera.zoom}
                animationDuration={0}
              />
            ) : null}

            {/* The whole day, faint. The camera stays on it and does not chase
                the line: a camera following the trace hides the drawing and,
                on a route with a lot of turns, is unpleasant to watch. */}
            <ShapeSource id="route-whole" shape={whole}>
              <LineLayer
                id="route-whole-line"
                style={{
                  lineColor: theme.colors.borderStrong,
                  lineWidth: 5,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineOpacity: 0.55,
                }}
              />
            </ShapeSource>

            {/* Only the stretch already covered, in the brand blue. Rebuilt as
                the index moves — which the animation quantises, so this is a
                bounded number of updates rather than one per frame. */}
            {index >= 1 ? (
              <ShapeSource id="route-covered" shape={lineString(props.points.slice(0, index + 1))}>
                <LineLayer
                  id="route-covered-line"
                  style={{
                    lineColor: theme.colors.brandPrimary,
                    lineWidth: 6,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </ShapeSource>
            ) : null}
          </MapView>
        </View>
      )}
    />
  );
}

export type { RouteReplayProps };
