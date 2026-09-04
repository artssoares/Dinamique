import { bearingDelta, boundsCentre, clamp, zoomToFit } from './geo';
import {
  clamp01,
  easeInOutCubic,
  easeInOutSine,
  easeOutBack,
  easeOutCubic,
  easeOutExpo,
  lerp,
  progressBetween,
  pulse,
  smoothstep,
} from './easing';
import type { RecapScene } from './scene';
import { sampleTrackAtDistance, type RecapTrack } from './track';

/**
 * The choreography.
 *
 * Relive is hypnotic for three reasons, and none of them is the satellite
 * imagery. First, the line is *drawn*: you watch it happen instead of being
 * shown the result. Second, the camera turns with the road, so the route
 * always flows up the screen and your eye never has to re-find it. Third, it
 * periodically pulls back to show the shape you have made so far, then drops
 * back in, the "look how far" beat, which is what makes a person watch the
 * same twenty seconds twice.
 *
 * All three are here. What is deliberately absent is a money counter running
 * alongside the head: see the note in scene.ts.
 *
 * Everything below is a pure function of the scene and a millisecond. That is
 * not architectural fussiness, it is what lets the whole camera path be
 * precomputed once (see film.ts), asserted in a test, and then replayed by
 * index rather than recalculated inside a template literal sixty times a
 * second on a phone that is also encoding video.
 */

export type RecapChapterKind =
  | 'opening'
  | 'drive'
  | 'reveal'
  | 'numbers'
  | 'signature';

export interface RecapChapter {
  kind: RecapChapterKind;
  startMs: number;
  endMs: number;
}

export interface RecapCamera {
  /** World coordinates, 0..1. */
  x: number;
  y: number;
  zoom: number;
  /** Degrees. The renderer rotates the world by −bearing, so travel goes up. */
  bearing: number;
  /**
   * 1 = straight down, smaller = leaning away. Applied as a vertical squash
   * rather than a true perspective divide: an affine transform is the whole
   * of what a 2D canvas can do at sixty frames a second on a phone, and the
   * squash plus a horizon gradient reads as tilt convincingly enough that
   * nobody has ever asked.
   */
  tilt: number;
}

export interface RecapFrame {
  tMs: number;
  chapter: RecapChapterKind;
  camera: RecapCamera;
  /** How much of the route is drawn, 0..1 of total distance. */
  progress: number;
  /** Head position in world coordinates; equals the route start at progress 0. */
  headX: number;
  headY: number;
  /** Metres and milliseconds revealed so far, both measured, neither invented. */
  revealedMetres: number;
  revealedMs: number;
  /** Opacities, 0..1. */
  hud: number;
  title: number;
  stats: number;
  signature: number;
  vignette: number;
  /** Count-up factor for the money figure in the finale. */
  statsReveal: number;
  /** A light sweep along the finished route at the reveal. 0..1. */
  flash: number;
  /** Halo scale on the head; swells on the pull-back beats. */
  headGlow: number;
}

export interface StoryboardOptions {
  /** Target length in milliseconds. Clamped to something shareable. */
  targetDurationMs?: number;
  /** Ground width the drive chapter keeps in frame, in metres. */
  driveWidthMetres?: number;
  /** How many "look how far" pull-backs to insert. */
  beats?: number;
}

export interface Storyboard {
  chapters: RecapChapter[];
  durationMs: number;
  /** Zoom at which the whole route fits the frame. */
  fitZoom: number;
  fitX: number;
  fitY: number;
  /** Base zoom during the drive. */
  driveZoom: number;
  beats: number[];
}

// Both of these are as long as they are because of how far the camera has to
// travel in them. A metro-area journey puts roughly 4.5 zoom levels between
// the establishing shot and the follow-cam; crossing that in under two
// seconds is a snap, however nicely it is eased. The test asserts the ceiling
// so shortening either of these fails loudly rather than shipping a jolt.
const OPENING_MS = 3_000;
const REVEAL_MS = 2_200;
const NUMBERS_MS = 4_200;
const SIGNATURE_MS = 2_100;
const FIXED_MS = OPENING_MS + REVEAL_MS + NUMBERS_MS + SIGNATURE_MS;

/** Under 10s nothing lands; over 30s it stops being a WhatsApp status. */
const MIN_DURATION_MS = 10_000;
const MAX_DURATION_MS = 30_000;
const DEFAULT_DURATION_MS = 22_000;

/** Long enough for the drawing to read as motion rather than a wipe. */
const MIN_DRIVE_MS = 4_500;

export function buildStoryboard(
  scene: RecapScene,
  options: StoryboardOptions = {},
): Storyboard {
  const target = clamp(
    options.targetDurationMs ?? DEFAULT_DURATION_MS,
    MIN_DURATION_MS,
    MAX_DURATION_MS,
  );

  const viewport = { width: scene.width, height: scene.height };
  const track = scene.track;

  if (!track) {
    // No route: the opening holds the date, the numbers do the work, and the
    // signature closes. Shorter on purpose, there is nothing to watch being
    // drawn, and padding it out would only make the absence obvious.
    const chapters: RecapChapter[] = [];
    let cursor = 0;
    for (const [kind, ms] of [
      ['opening', OPENING_MS],
      ['numbers', NUMBERS_MS + 1_400],
      ['signature', SIGNATURE_MS],
    ] as const) {
      chapters.push({ kind, startMs: cursor, endMs: cursor + ms });
      cursor += ms;
    }
    return {
      chapters,
      durationMs: cursor,
      fitZoom: 12,
      fitX: 0.5,
      fitY: 0.5,
      driveZoom: 12,
      beats: [],
    };
  }

  const centre = boundsCentre(track.bounds);
  const fitZoom = zoomToFit(track.bounds, viewport, {
    padding: 0.14,
    maxZoom: scene.basemap.maxZoom,
  });

  // The drive keeps a fixed ground width in frame. Wider on a long route so
  // the head is not sprinting through a keyhole; the clamp stops a 400 km day
  // from zooming out until the line is a hair.
  const driveWidth = options.driveWidthMetres ?? driveWidthFor(track.distance);
  const driveZoom = clamp(
    zoomForGroundWidth(driveWidth, track.metresPerWorldUnit, scene.width, scene.basemap.tileSize),
    fitZoom,
    scene.basemap.maxZoom,
  );

  const driveMs = Math.max(MIN_DRIVE_MS, target - FIXED_MS);
  const beatCount = options.beats ?? (driveMs >= 9_500 ? 2 : driveMs >= 6_500 ? 1 : 0);
  const beats: number[] = [];
  for (let i = 1; i <= beatCount; i += 1) {
    beats.push(i / (beatCount + 1));
  }

  const chapters: RecapChapter[] = [];
  let cursor = 0;
  for (const [kind, ms] of [
    ['opening', OPENING_MS],
    ['drive', driveMs],
    ['reveal', REVEAL_MS],
    ['numbers', NUMBERS_MS],
    ['signature', SIGNATURE_MS],
  ] as const) {
    chapters.push({ kind, startMs: cursor, endMs: cursor + ms });
    cursor += ms;
  }

  return {
    chapters,
    durationMs: cursor,
    fitZoom,
    fitX: centre.x,
    fitY: centre.y,
    driveZoom,
    beats,
  };
}

/** A short hop deserves a tighter frame than a day spent crossing a metro area. */
function driveWidthFor(distanceMetres: number): number {
  if (distanceMetres < 8_000) return 500;
  if (distanceMetres < 25_000) return 900;
  if (distanceMetres < 80_000) return 1_600;
  if (distanceMetres < 200_000) return 3_200;
  return 6_000;
}

function zoomForGroundWidth(
  groundMetres: number,
  metresPerWorld: number,
  viewportWidth: number,
  tileSize: number,
): number {
  const worldSpan = groundMetres / metresPerWorld;
  return Math.log2(viewportWidth / (worldSpan * tileSize));
}

function chapterAt(storyboard: Storyboard, tMs: number): RecapChapter {
  const last = storyboard.chapters[storyboard.chapters.length - 1]!;
  for (const chapter of storyboard.chapters) {
    if (tMs < chapter.endMs) return chapter;
  }
  return last;
}

/**
 * The frame at `tMs`. Pure, total, and defined for any t, clamped at both
 * ends so a scrubber dragged past the end holds the last frame instead of
 * producing NaN and a blank canvas.
 */
export function sampleFrame(
  scene: RecapScene,
  storyboard: Storyboard,
  tMs: number,
): RecapFrame {
  const t = clamp(tMs, 0, storyboard.durationMs);
  const chapter = chapterAt(storyboard, t);
  const local = progressBetween(t, chapter.startMs, chapter.endMs);
  const track = scene.track;

  if (!track) return samplelessFrame(chapter, local, t);

  const start = track.points[0]!;
  const base: RecapFrame = {
    tMs: t,
    chapter: chapter.kind,
    camera: { x: start.x, y: start.y, zoom: storyboard.driveZoom, bearing: 0, tilt: 1 },
    progress: 0,
    headX: start.x,
    headY: start.y,
    revealedMetres: 0,
    revealedMs: 0,
    hud: 0,
    title: 0,
    stats: 0,
    signature: 0,
    vignette: 0.35,
    statsReveal: 0,
    flash: 0,
    headGlow: 1,
  };

  switch (chapter.kind) {
    case 'opening':
      return openingFrame(base, storyboard, track, local);
    case 'drive':
      return driveFrame(base, storyboard, track, local);
    case 'reveal':
      return revealFrame(base, storyboard, track, local);
    case 'numbers':
      return numbersFrame(base, storyboard, track, local);
    case 'signature':
      return signatureFrame(base, storyboard, track, local);
  }
}

/**
 * Opening: high above the whole route, turning slowly, then falling toward the
 * start. The route is not drawn yet, the frame is a place, and the title says
 * whose day it was.
 */
function openingFrame(
  frame: RecapFrame,
  storyboard: Storyboard,
  track: RecapTrack,
  local: number,
): RecapFrame {
  const start = track.points[0]!;
  // One ease, and a sine one.
  //
  // Every smooth in-out curve spends part of its budget moving faster than
  // average; what separates them is how much. Over the same window a cubic
  // peaks at 3× the average rate and a sine at π/2, so the cubic descent
  // crossed four and a half zoom levels at a rate that read as a lurch
  // through the midpoint, and the sine does not. Composing two eases, which
  // this used to do, multiplies the peaks and is always wrong.
  const descent = easeInOutSine(progressBetween(local, 0.18, 1));

  frame.camera.x = lerp(storyboard.fitX, start.x, descent);
  frame.camera.y = lerp(storyboard.fitY, start.y, descent);
  // Start a little wider than the fit so the first move is outward-feeling.
  frame.camera.zoom = lerp(storyboard.fitZoom - 0.6, storyboard.driveZoom, descent);
  frame.camera.bearing = lerp(-14, start.bearing, descent);
  frame.camera.tilt = lerp(0.95, 0.62, descent);

  frame.title = pulse(smoothstep(0, 1, local) ** 0.7);
  // Hold the title up until the descent is nearly done, then hand over to the
  // HUD rather than crossfading the two on top of each other.
  frame.title = Math.max(frame.title, 1 - easeInCubicLocal(local));
  frame.hud = smoothstep(0.72, 1, local);
  frame.vignette = lerp(0.62, 0.34, descent);
  frame.headGlow = lerp(0.2, 1, smoothstep(0.6, 1, local));
  return frame;
}

function easeInCubicLocal(local: number): number {
  return clamp01(progressBetween(local, 0.6, 1)) ** 2;
}

/**
 * Drive: the head advances at the speed it was actually driven, the camera
 * rides it, and twice along the way the frame pulls back to show the shape so
 * far.
 *
 * The head is driven by *distance*, eased. Driving it by elapsed time instead
 * would spend a third of the video on a lunch break, and driving it linearly
 * by distance would start and stop like a lift. The ease is gentle, a long
 * S-curve, so the line accelerates into the journey and settles at the end.
 */
function driveFrame(
  frame: RecapFrame,
  storyboard: Storyboard,
  track: RecapTrack,
  local: number,
): RecapFrame {
  const eased = easeInOutSine(local) * 0.18 + local * 0.82;
  const progress = clamp01(eased);
  const sample = sampleTrackAtDistance(track, progress * track.distance);

  // The pull-back beats. Each is a half-sine over a window of the chapter, so
  // it swells out and settles back with no seam at either edge.
  let beat = 0;
  for (const at of storyboard.beats) {
    beat = Math.max(beat, pulse(progressBetween(local, at - 0.1, at + 0.1)));
  }

  // Faster driving widens the frame a little, 90 km/h through a keyhole is
  // frantic, and the same shot at 20 km/h is dull.
  const speedZoomOut = smoothstep(6, 26, sample.index > 0 ? track.points[sample.index]!.speed : 0);
  // And a slow breath underneath everything, which is most of why it is
  // pleasant to watch for twenty seconds.
  const breath = Math.sin(local * Math.PI * 2.4) * 0.16;

  frame.camera.x = sample.point.x;
  frame.camera.y = sample.point.y;
  frame.camera.zoom = clamp(
    storyboard.driveZoom - beat * 2.1 - speedZoomOut * 0.7 + breath,
    storyboard.fitZoom - 0.6,
    storyboard.driveZoom + 0.4,
  );
  frame.camera.bearing = sample.bearing;
  // Flatten out as we pull back: a tilted view of a whole city is a smear.
  frame.camera.tilt = lerp(0.62, 0.9, beat);

  frame.progress = progress;
  frame.headX = sample.point.x;
  frame.headY = sample.point.y;
  frame.revealedMetres = sample.distance;
  frame.revealedMs = sample.elapsedMs;
  frame.hud = 1;
  frame.vignette = lerp(0.34, 0.22, beat);
  frame.headGlow = 1 + beat * 0.9;
  return frame;
}

/**
 * Reveal: the head arrives, the camera lifts off it and pulls back until the
 * whole route fits, straightening north as it goes. A light runs the length of
 * the line, the one purely decorative flourish in the whole thing, and the
 * moment people replay.
 */
function revealFrame(
  frame: RecapFrame,
  storyboard: Storyboard,
  track: RecapTrack,
  local: number,
): RecapFrame {
  const last = track.points[track.points.length - 1]!;
  // Same reasoning as the opening's descent, and the same curve. easeOutExpo,
  // which this used to be, leaves at nearly seven times the average rate ,
  // lovely on an opacity, a jump cut on a zoom.
  const eased = easeInOutSine(local);

  frame.camera.x = lerp(last.x, storyboard.fitX, eased);
  frame.camera.y = lerp(last.y, storyboard.fitY, eased);
  frame.camera.zoom = lerp(storyboard.driveZoom, storyboard.fitZoom, eased);
  // Unwind by the shortest path so a route that ended heading north-west does
  // not spin three quarters of a turn to get back to north.
  frame.camera.bearing = last.bearing + bearingDelta(last.bearing, 0) * eased;
  frame.camera.tilt = lerp(0.62, 1, easeOutCubic(local));

  frame.progress = 1;
  frame.headX = last.x;
  frame.headY = last.y;
  frame.revealedMetres = track.distance;
  frame.revealedMs = track.durationMs;
  frame.hud = 1 - smoothstep(0.55, 1, local);
  frame.vignette = lerp(0.24, 0.5, easeInOutCubic(local));
  frame.flash = clamp01(progressBetween(local, 0.12, 0.92));
  frame.headGlow = lerp(2.2, 0.6, easeOutCubic(local));
  return frame;
}

/**
 * Numbers: the map holds still under a darkening scrim and drifts very
 * slightly, which keeps the frame alive while the eye is on the figures. The
 * money counts up once, here, and nowhere else.
 */
function numbersFrame(
  frame: RecapFrame,
  storyboard: Storyboard,
  track: RecapTrack,
  local: number,
): RecapFrame {
  const drift = easeInOutSine(local);

  frame.camera.x = storyboard.fitX;
  frame.camera.y = storyboard.fitY;
  frame.camera.zoom = storyboard.fitZoom + drift * 0.35;
  frame.camera.bearing = drift * 3.5;
  frame.camera.tilt = 1;

  frame.progress = 1;
  frame.headX = track.points[track.points.length - 1]!.x;
  frame.headY = track.points[track.points.length - 1]!.y;
  frame.revealedMetres = track.distance;
  frame.revealedMs = track.durationMs;
  frame.vignette = lerp(0.5, 0.74, easeOutCubic(smoothstep(0, 0.35, local)));
  frame.stats = easeOutBack(smoothstep(0.04, 0.42, local));
  frame.statsReveal = easeOutExpo(smoothstep(0.1, 0.72, local));
  frame.signature = smoothstep(0.86, 1, local) * 0.4;
  frame.headGlow = 0.6;
  return frame;
}

/** Signature: everything recedes, the mark and the handle are what is left. */
function signatureFrame(
  frame: RecapFrame,
  storyboard: Storyboard,
  track: RecapTrack,
  local: number,
): RecapFrame {
  frame.camera.x = storyboard.fitX;
  frame.camera.y = storyboard.fitY;
  frame.camera.zoom = storyboard.fitZoom + 0.35 + local * 0.5;
  frame.camera.bearing = 3.5 + local * 2.5;
  frame.camera.tilt = 1;

  frame.progress = 1;
  frame.headX = track.points[track.points.length - 1]!.x;
  frame.headY = track.points[track.points.length - 1]!.y;
  frame.revealedMetres = track.distance;
  frame.revealedMs = track.durationMs;
  frame.vignette = lerp(0.74, 0.92, easeInOutCubic(smoothstep(0, 0.6, local)));
  frame.stats = 1 - smoothstep(0, 0.32, local);
  frame.statsReveal = 1;
  frame.signature = easeOutBack(smoothstep(0.1, 0.7, local));
  frame.headGlow = 0.4;
  return frame;
}

/**
 * The mapless variant. Same beats, no geography: the renderer paints a moving
 * field instead of tiles, and the camera numbers only drive that field's
 * parallax. A driver who has never turned route capture on still gets a recap
 * worth sending, which is the point, the feature cannot be gated behind a
 * permission most people will not grant on the first day.
 */
function samplelessFrame(
  chapter: RecapChapter,
  local: number,
  tMs: number,
): RecapFrame {
  const frame: RecapFrame = {
    tMs,
    chapter: chapter.kind,
    camera: { x: 0.5, y: 0.5, zoom: 12, bearing: 0, tilt: 1 },
    progress: 0,
    headX: 0.5,
    headY: 0.5,
    revealedMetres: 0,
    revealedMs: 0,
    hud: 0,
    title: 0,
    stats: 0,
    signature: 0,
    vignette: 0.55,
    statsReveal: 0,
    flash: 0,
    headGlow: 1,
  };

  // The camera still moves, because the field parallaxes off it and a
  // perfectly static gradient looks like a loading screen.
  frame.camera.bearing = tMs / 420;
  frame.camera.zoom = 12 + Math.sin(tMs / 2600) * 0.4;

  switch (chapter.kind) {
    case 'opening':
      frame.title = Math.min(1, pulse(local ** 0.65) + (1 - easeInCubicLocal(local)));
      frame.vignette = lerp(0.68, 0.5, easeOutCubic(local));
      break;
    case 'numbers':
      frame.stats = easeOutBack(smoothstep(0.02, 0.36, local));
      frame.statsReveal = easeOutExpo(smoothstep(0.06, 0.66, local));
      frame.vignette = 0.6;
      frame.signature = smoothstep(0.88, 1, local) * 0.4;
      break;
    case 'signature':
      frame.stats = 1 - smoothstep(0, 0.3, local);
      frame.statsReveal = 1;
      frame.signature = easeOutBack(smoothstep(0.1, 0.7, local));
      frame.vignette = lerp(0.6, 0.88, easeInOutCubic(local));
      break;
    default:
      break;
  }

  return frame;
}
