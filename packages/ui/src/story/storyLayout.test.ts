import { describe, expect, it } from 'vitest';
import {
  FIGURE_GUTTER,
  STORY_HEIGHT,
  STORY_MARGIN,
  STORY_TYPE,
  STORY_WIDTH,
  TRACE,
  figureColumnWidth,
  figureColumnX,
  figureRowFontSize,
} from './storyLayout';

describe('story frame', () => {
  it('is exactly 9:16 at story resolution', () => {
    expect(STORY_WIDTH).toBe(1080);
    expect(STORY_HEIGHT).toBe(1920);
    expect(STORY_WIDTH / STORY_HEIGHT).toBeCloseTo(9 / 16, 10);
  });

  it('keeps the trace inside the margins', () => {
    expect(TRACE.x).toBeGreaterThanOrEqual(STORY_MARGIN);
    expect(TRACE.x + TRACE.width).toBeLessThanOrEqual(STORY_WIDTH - STORY_MARGIN);
    expect(TRACE.y + TRACE.height).toBeLessThan(STORY_HEIGHT);
  });
});

describe('the figure row', () => {
  /** Roughly what the renderer gives a bold string at a given size. */
  const widthOf = (text: string, size: number) => text.length * 0.62 * size;

  const fits = (values: readonly string[]) => {
    const size = figureRowFontSize(values, values.length);
    const column = figureColumnWidth(values.length);
    return values.every((value) => widthOf(value, size) <= column);
  };

  it('keeps an ordinary day inside its columns', () => {
    // The values that used to collide: at the headline size "8h 25min" is
    // wider than a third of the card, and the three figures overlapped.
    expect(fits(['187,4 km', '8h 25min', 'R$ 2,20'])).toBe(true);
  });

  it('keeps a very long day inside its columns', () => {
    expect(fits(['1.284,6 km', '23h 59min', 'R$ 12,34'])).toBe(true);
  });

  it('does not shrink short values below the headline size', () => {
    expect(figureRowFontSize(['9 km', '2h', '—'], 3)).toBe(STORY_TYPE.figure);
  });

  it('gives every figure the same size, so none reads as the important one', () => {
    const values = ['1.284,6 km', '2h', '—'];
    const size = figureRowFontSize(values, values.length);
    for (const value of values) {
      expect(figureRowFontSize([value, ...values], values.length)).toBeLessThanOrEqual(size);
    }
  });

  it('leaves a gutter between neighbouring columns', () => {
    const gap = figureColumnX(1, 3) - figureColumnX(0, 3) - figureColumnWidth(3);
    expect(gap).toBeCloseTo(FIGURE_GUTTER, 10);
  });

  // A value long enough to break the fit is allowed to crowd its gutter; it
  // is never allowed to shrink into something nobody can read on a phone.
  it('never returns something that would render as fine print', () => {
    expect(figureRowFontSize(['x'.repeat(80)], 3)).toBe(40);
  });
});
