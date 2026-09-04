import type { RecapScene } from './scene';
import { buildStoryboard, sampleFrame, type Storyboard, type StoryboardOptions } from './storyboard';

/**
 * The storyboard, flattened into every frame it will ever produce.
 *
 * Two things fall out of precomputing, and both matter.
 *
 * The choreography stays in TypeScript, under test, instead of duplicated
 * inside a template literal where no test can reach it. The painter receives
 * numbers and paints them; it makes no decisions.
 *
 * And frame N is frame N. The player and the recorder both map their clock to
 * an index and ask for it, so a phone that can only paint eighteen frames a
 * second produces the same film as a flagship with fewer of its frames in it ,
 * never a different one, and never one that runs long. Camera maths also
 * leaves the hot loop entirely, which is most of the per-frame budget on the
 * devices that need it most.
 *
 * Cost: ~17 numbers per frame. A 22-second film at 30 fps is 660 frames, about
 * 11 000 numbers, under 100 KB of JSON, which is nothing next to a single map
 * tile.
 */

export interface RecapFilm {
  fps: number;
  frameCount: number;
  durationMs: number;
  width: number;
  height: number;
  /** Route vertices as flattened world coordinates: x0, y0, x1, y1, … */
  path: number[];
  /** Cumulative metres at each vertex; same length as `path` ÷ 2. */
  pathDistances: number[];
  /**
   * What the HUD multiplies the revealed metres by before printing them.
   *
   * The track's own length is the sum of its cleaned, simplified legs, and it
   * is what drives the drawing. The kilometres the day *filed* (odometer,
   * manual figure, or the GPS total as it was saved) are what the history and
   * the finale show, and the two differ by a few percent on every route. A
   * counter that climbs to 34,7 km under a card that says 33,0 km is the
   * replay disagreeing with the history about the same shift, so the counter
   * is scaled to land on the filed figure. 1 when the day filed nothing.
   */
  hudDistanceScale: number;
  /** Per-frame channels, each `frameCount` long. */
  channels: RecapChannels;
}

export interface RecapChannels {
  cameraX: number[];
  cameraY: number[];
  zoom: number[];
  bearing: number[];
  tilt: number[];
  headX: number[];
  headY: number[];
  progress: number[];
  metres: number[];
  elapsed: number[];
  hud: number[];
  title: number[];
  stats: number[];
  statsReveal: number[];
  signature: number[];
  vignette: number[];
  flash: number[];
  headGlow: number[];
}

export interface FilmOptions extends StoryboardOptions {
  /**
   * 30 is the right answer for a share video: 60 doubles the payload and the
   * encode time for motion that is already smooth, and 24 shows its seams on
   * the rotating pull-backs.
   */
  fps?: number;
}

/** World coordinates need ~1e-8 to stay inside half a metre; the rest do not. */
const WORLD_DECIMALS = 8;
const OPACITY_DECIMALS = 4;

export function buildFilm(
  scene: RecapScene,
  options: FilmOptions = {},
): { film: RecapFilm; storyboard: Storyboard } {
  const fps = options.fps ?? 30;
  const storyboard = buildStoryboard(scene, options);
  const frameCount = Math.max(1, Math.round((storyboard.durationMs / 1000) * fps));

  const channels: RecapChannels = {
    cameraX: [],
    cameraY: [],
    zoom: [],
    bearing: [],
    tilt: [],
    headX: [],
    headY: [],
    progress: [],
    metres: [],
    elapsed: [],
    hud: [],
    title: [],
    stats: [],
    statsReveal: [],
    signature: [],
    vignette: [],
    flash: [],
    headGlow: [],
  };

  for (let i = 0; i < frameCount; i += 1) {
    const frame = sampleFrame(scene, storyboard, (i * 1000) / fps);
    channels.cameraX.push(round(frame.camera.x, WORLD_DECIMALS));
    channels.cameraY.push(round(frame.camera.y, WORLD_DECIMALS));
    channels.zoom.push(round(frame.camera.zoom, 4));
    channels.bearing.push(round(frame.camera.bearing, 3));
    channels.tilt.push(round(frame.camera.tilt, 4));
    channels.headX.push(round(frame.headX, WORLD_DECIMALS));
    channels.headY.push(round(frame.headY, WORLD_DECIMALS));
    channels.progress.push(round(frame.progress, 6));
    channels.metres.push(Math.round(frame.revealedMetres));
    channels.elapsed.push(Math.round(frame.revealedMs));
    channels.hud.push(round(frame.hud, OPACITY_DECIMALS));
    channels.title.push(round(frame.title, OPACITY_DECIMALS));
    channels.stats.push(round(frame.stats, OPACITY_DECIMALS));
    channels.statsReveal.push(round(frame.statsReveal, OPACITY_DECIMALS));
    channels.signature.push(round(frame.signature, OPACITY_DECIMALS));
    channels.vignette.push(round(frame.vignette, OPACITY_DECIMALS));
    channels.flash.push(round(frame.flash, OPACITY_DECIMALS));
    channels.headGlow.push(round(frame.headGlow, 3));
  }

  const path: number[] = [];
  const pathDistances: number[] = [];
  for (const point of scene.track?.points ?? []) {
    path.push(round(point.x, WORLD_DECIMALS), round(point.y, WORLD_DECIMALS));
    pathDistances.push(Math.round(point.d));
  }

  const filed = scene.stats.distance;
  const drawn = scene.track?.distance ?? 0;
  const hudDistanceScale =
    filed !== null && filed > 0 && drawn > 0 ? round(filed / drawn, 6) : 1;

  return {
    film: {
      fps,
      frameCount,
      durationMs: storyboard.durationMs,
      width: scene.width,
      height: scene.height,
      path,
      pathDistances,
      hudDistanceScale,
      channels,
    },
    storyboard,
  };
}

function round(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
