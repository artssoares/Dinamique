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
 * `arcgis/imagery` is satellite with place labels over it, and it is the style
 * because of what this map is for. A navigation basemap is built to be read
 * while deciding which turn to take: quiet, flat, road names first. Nobody
 * reads this map — they look at a day they already lived. Imagery gives the
 * ground texture and colour, which is what makes the relief underneath
 * visible at all: a street map draped over a hill still looks like a street
 * map, because it has no shading of its own to catch the light.
 *
 * `arcgis/navigation` is the swap back, one constant, if the imagery ever
 * makes the route hard to pick out.
 */

const STYLE = 'arcgis/imagery';

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

/**
 * Elevation, so the map has relief and not just perspective.
 *
 * The Terrain Tiles dataset on AWS Open Data: public, no key, and in the
 * `terrarium` encoding MapLibre reads directly. Esri publishes elevation too,
 * but not in a format MapLibre can consume, so this is a second source rather
 * than a second vendor by choice.
 *
 * It is decoration in the strictest sense — the route, the distance and every
 * figure are identical with or without it — so it is added after the map has
 * already loaded and a failure to fetch a single tile is allowed to pass
 * silently. A driver looking at a flatter map is not a driver missing data.
 */
export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';

/** The dataset stops here; asking for deeper tiles returns nothing. */
export const TERRAIN_MAX_ZOOM = 15;

/**
 * How much the relief is overstated.
 *
 * Slightly, and on purpose: at true scale a city is visually flat, and the
 * point of the relief is that the ground reads as ground. Far enough below the
 * cartoon range that a hill is still the size of a hill.
 */
export const TERRAIN_EXAGGERATION = 1.3;

/** Required alongside the basemap credit whenever the relief is drawn. */
export const TERRAIN_ATTRIBUTION = 'Relevo: Terrain Tiles';
