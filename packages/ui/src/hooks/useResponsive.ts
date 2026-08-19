import { useWindowDimensions } from 'react-native';
import { breakpoints, layout, type Breakpoint } from '../tokens/index';

export interface Responsive {
  width: number;
  height: number;
  /** The largest breakpoint the current width satisfies. */
  size: Breakpoint;
  /** 360dp and under — the cheap Androids. Tighten padding, drop decoration. */
  isCompact: boolean;
  /** 600dp and up — large phones in landscape, tablets, web. */
  isMedium: boolean;
  /** 900dp and up. */
  isExpanded: boolean;
  /** Landscape phones need vertical space back. */
  isLandscape: boolean;
  /** Columns a card grid should use at this width. */
  columns: number;
  /** Width a reading column is clamped to — forms, lists, headers. */
  contentWidth: number;
  /** Width a card grid may use. Wider, because tiles tolerate more room. */
  wideContentWidth: number;
  /**
   * Scales a dp value with the screen, clamped so nothing ever grows or
   * shrinks past legibility. Used for the hero figure and the tab bar.
   */
  scale: (value: number, options?: { min?: number; max?: number }) => number;
}

/**
 * One hook every screen uses instead of hard-coding phone widths.
 *
 * The app runs on 360dp Androids, on tablets and on the web from the same
 * source. Without this a card row that fits an iPhone becomes three inches of
 * whitespace on an iPad and overflows on an SE.
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  // 390dp (an iPhone 14) is an ordinary phone, not a cramped one.
  const isCompact = width <= breakpoints.compact;
  const isMedium = width >= breakpoints.medium;
  const isExpanded = width >= breakpoints.expanded;

  const size: Breakpoint = isExpanded
    ? 'expanded'
    : isMedium
      ? 'medium'
      : isCompact
        ? 'compact'
        : 'regular';

  // Both are clamped by the window so a narrow phone never reports a column
  // wider than its own screen.
  const contentWidth = Math.min(width, layout.maxContentWidth);
  const wideContentWidth = Math.min(width, layout.maxWideContentWidth);

  return {
    width,
    height,
    size,
    isCompact,
    isMedium,
    isExpanded,
    isLandscape: width > height,
    columns: isExpanded ? 3 : isMedium ? 2 : 1,
    contentWidth,
    wideContentWidth,
    scale: (value, options) => {
      // 390dp (an iPhone 14) is the width the type scale was drawn against.
      const factor = Math.min(1.15, Math.max(0.88, width / 390));
      const scaled = Math.round(value * factor);
      const min = options?.min ?? Math.round(value * 0.85);
      const max = options?.max ?? Math.round(value * 1.2);
      return Math.min(max, Math.max(min, scaled));
    },
  };
}
