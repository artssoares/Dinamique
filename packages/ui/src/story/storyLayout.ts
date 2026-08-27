/**
 * The geometry of the shareable card.
 *
 * 1080×1920 because that is what Instagram and WhatsApp stories are; anything
 * else gets letterboxed or cropped, and a card cropped through its own numbers
 * is not worth sharing.
 *
 * The numbers live here rather than inside the component so the layout can be
 * reasoned about — and tested — without rendering anything.
 */

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/** Generous: story UI (the profile row, the reply bar) eats the edges. */
export const STORY_MARGIN = 96;

/**
 * The box the route is drawn into.
 *
 * Above the figures rather than behind them. A trace under text is a texture;
 * a trace with room around it is the day, and the day is what somebody stops
 * scrolling for.
 */
export const TRACE = {
  x: STORY_MARGIN,
  y: 380,
  width: STORY_WIDTH - STORY_MARGIN * 2,
  height: 760,
  padding: 48,
} as const;

export const TRACE_STROKE = 14;

export const STORY_TYPE = {
  brand: 44,
  date: 34,
  figure: 92,
  figureLabel: 30,
  footer: 28,
} as const;

/** Where each of the three figures starts, left to right. */
export const FIGURE_ROW_Y = 1420;

/** Air between two figures, so a long one never touches its neighbour. */
export const FIGURE_GUTTER = 32;

/**
 * Below this the row stops being a headline and starts being fine print, so
 * a pathological value is allowed to crowd its gutter rather than disappear.
 * Every real figure — the longest being "1.284,6 km" — fits above it.
 */
const FIGURE_MIN_SIZE = 40;

/**
 * Bold digits and capitals measure about 0.62 of the point size in advance
 * width — taken off a rendered card rather than guessed. Used only to shrink,
 * so being a little pessimistic costs a couple of points; being optimistic
 * would cost a figure running into the one beside it.
 */
const ADVANCE_PER_POINT = 0.62;

export function figureColumnX(index: number, total: number): number {
  const usable = STORY_WIDTH - STORY_MARGIN * 2;
  const column = usable / total;
  return STORY_MARGIN + column * index + column / 2;
}

export function figureColumnWidth(total: number): number {
  return (STORY_WIDTH - STORY_MARGIN * 2) / total - FIGURE_GUTTER;
}

/**
 * One size for the whole row, chosen so the longest value fits its column.
 *
 * `STORY_TYPE.figure` was picked for values like "187 km". A perfectly
 * ordinary day produces "8h 25min", which at that size is wider than a third
 * of the card — so the three figures collided and the card went out with the
 * numbers written over each other.
 *
 * The row shares one size rather than each figure fitting itself: three
 * headline numbers at three different sizes read as a ranking that is not
 * there.
 */
export function figureRowFontSize(values: readonly string[], total: number): number {
  const column = figureColumnWidth(total);
  let size: number = STORY_TYPE.figure;

  for (const value of values) {
    if (value.length === 0) continue;
    size = Math.min(size, Math.floor(column / (value.length * ADVANCE_PER_POINT)));
  }

  return Math.max(FIGURE_MIN_SIZE, size);
}

/**
 * The typeface the card renders in.
 *
 * SVG has no default sans of its own: with no family named, a browser falls
 * back to its standard serif, and the exported story came out in Times while
 * the app around it is not. Native resolves an unknown family to the system
 * face, so this only has to be set on the web.
 */
export const STORY_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
