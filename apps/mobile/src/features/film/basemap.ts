import { ESRI_WORLD_IMAGERY, type RecapBasemap } from '@dinamique/recap';

/**
 * Where the satellite imagery under the film comes from.
 *
 * Not the same source as the in-app replay. The replay is a MapLibre vector
 * map keyed to the ArcGIS style API; the film is a canvas that paints raster
 * tiles and is then recorded, so it needs plain image tiles served with CORS
 * headers, and a licence that allows the frame to be redistributed, because
 * the frame ends up in a WhatsApp group. Esri's World Imagery tile service
 * meets both, with no key, and is the default shipped in `@dinamique/recap`.
 *
 * `EXPO_PUBLIC_FILM_TILES_URL` swaps the provider without touching code. It
 * is written out in full, and must stay that way: Metro only substitutes
 * `process.env.EXPO_PUBLIC_X` when it finds exactly that text. Read through a
 * computed key it comes back undefined on the device, with no error to say so.
 * An empty string means "no imagery": the film then draws its dark field with
 * the route glowing on it, which is a designed variant, not a broken map.
 */
const TILES_OVERRIDE = process.env.EXPO_PUBLIC_FILM_TILES_URL;
const ATTRIBUTION_OVERRIDE = process.env.EXPO_PUBLIC_FILM_TILES_ATTRIBUTION;

export function filmBasemap(): RecapBasemap {
  if (TILES_OVERRIDE === undefined) return ESRI_WORLD_IMAGERY;

  const template = TILES_OVERRIDE.trim();
  if (template === '') {
    return { urlTemplate: null, attribution: null, tileSize: 256, maxZoom: 18 };
  }

  return {
    urlTemplate: template,
    attribution: ATTRIBUTION_OVERRIDE?.trim() || null,
    tileSize: 256,
    maxZoom: 19,
  };
}
