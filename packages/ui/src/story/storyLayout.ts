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

export function figureColumnX(index: number, total: number): number {
  const usable = STORY_WIDTH - STORY_MARGIN * 2;
  const column = usable / total;
  return STORY_MARGIN + column * index + column / 2;
}
