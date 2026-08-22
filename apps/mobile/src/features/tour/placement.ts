import type { TargetRect } from './TourProvider';

export type TourPlacement = 'below' | 'above' | 'floating';

export interface PlacementInput {
  /** The cut-out, already padded. Null when the step points at nothing. */
  hole: TargetRect | null;
  /** Height the card actually measured. 0 before the first layout. */
  cardHeight: number;
  screenHeight: number;
  /** Safe area, so the card clears the notch and the home indicator. */
  insetTop: number;
  insetBottom: number;
  /** Distance kept from the cut-out. */
  gap: number;
  /** Distance kept from the edge of the safe area. */
  margin: number;
}

export interface Placement {
  top: number;
  placement: TourPlacement;
  /** Ceiling for the card, so long copy scrolls instead of overflowing. */
  maxHeight: number;
}

/**
 * Where the coach mark's card goes.
 *
 * This is the whole of the bug that froze the tour, so it is a pure function
 * with tests rather than arithmetic buried in a render. The old version asked
 * "is there more than 260 pixels below the highlight?" and put the card there
 * if so. 260 was a guess at the card's height. When the card was taller, which
 * a longer description or a shorter screen was enough to cause, it was placed
 * below the fold: the text ran off the bottom of the screen, and "Pular" and
 * "Próximo" went with it. The scrim swallows every tap, so there was no way
 * out except reloading the page.
 *
 * Three rules replace the guess:
 *   1. use the card's measured height, never an assumed one;
 *   2. prefer below, fall back to above, and float in the middle when neither
 *      side has room;
 *   3. clamp the result into the safe area no matter which branch produced it.
 *
 * Rule three is the one that makes an unreachable control impossible.
 */
export function placeCard({
  hole,
  cardHeight,
  screenHeight,
  insetTop,
  insetBottom,
  gap,
  margin,
}: PlacementInput): Placement {
  const safeTop = insetTop + margin;
  const safeBottom = screenHeight - insetBottom - margin;
  // 200 is a floor, not a guess: on a screen too short for anything, a card
  // that can scroll beats a card that cannot be read at all.
  const maxHeight = Math.max(200, safeBottom - safeTop);
  const height = cardHeight > 0 ? Math.min(cardHeight, maxHeight) : 0;

  let placement: TourPlacement = 'floating';
  let top = safeTop + Math.max(0, (safeBottom - safeTop - height) / 2);

  if (hole && height > 0) {
    const roomBelow = safeBottom - (hole.y + hole.height) - gap;
    const roomAbove = hole.y - gap - safeTop;

    if (roomBelow >= height) {
      placement = 'below';
      top = hole.y + hole.height + gap;
    } else if (roomAbove >= height) {
      placement = 'above';
      top = hole.y - gap - height;
    }
  }

  const lowest = Math.max(safeTop, safeBottom - height);
  const clamped = Math.min(Math.max(top, safeTop), lowest);

  return {
    top: clamped,
    // A card that had to be moved is no longer touching the cut-out, so it
    // must not keep claiming to point at it.
    placement: clamped === top ? placement : 'floating',
    maxHeight,
  };
}

/**
 * Rejects a measurement the coach mark cannot honestly point at: a control
 * scrolled off the screen, or one so large that cutting it out would leave no
 * scrim at all. Both used to be drawn anyway, as a hole in the wrong place.
 */
export function usableRect(
  rect: TargetRect | null,
  screenWidth: number,
  screenHeight: number,
): TargetRect | null {
  if (!rect) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  if (rect.height > screenHeight * 0.7) return null;
  const onScreenVertically = rect.y + rect.height > 0 && rect.y < screenHeight;
  const onScreenHorizontally = rect.x + rect.width > 0 && rect.x < screenWidth;
  return onScreenVertically && onScreenHorizontally ? rect : null;
}
