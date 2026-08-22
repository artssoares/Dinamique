/**
 * Where the map underneath the replay comes from.
 *
 * Esri's ArcGIS Location Platform, the same basemap Relive uses, reached
 * through MapLibre rather than through Google or Apple. That choice is not
 * about looks: both native SDKs forbid drawing their tiles into an image the
 * user can save or share, and a route the driver cannot show anybody is half
 * the feature. MapLibre also renders identically on iOS, Android and the web,
 * so there is one replay to design and one to debug.
 *
 * `arcgis/navigation` is the style meant for a vehicle in motion — the road
 * hierarchy stays legible at the size a phone shows a whole day at. Satellite
 * is a one-constant swap here when we have the licence for it.
 */

const STYLE = 'arcgis/navigation';

const key = process.env.EXPO_PUBLIC_ARCGIS_API_KEY?.trim() ?? '';

/**
 * Whether a real map can be drawn at all.
 *
 * False on any checkout without a key — CI, a fresh clone, a contributor who
 * has never seen the Esri console. The replay must not break there, so
 * `RouteReplay.native` falls back to exactly the traced line the web draws.
 * A missing key is a plainer replay, never a blank screen.
 */
export const HAS_BASEMAP = key.length > 0;

export function basemapStyleUrl(): string | null {
  if (!HAS_BASEMAP) return null;
  return `https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/${STYLE}?token=${encodeURIComponent(key)}`;
}

/**
 * Required by the Esri terms, and therefore never conditional and never behind
 * a tap. It renders only when a basemap is actually being drawn — attributing
 * a map that is not on screen would be its own kind of wrong.
 */
export const BASEMAP_ATTRIBUTION = 'Powered by Esri';
