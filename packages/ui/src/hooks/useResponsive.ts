import { useSyncExternalStore } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { breakpoints, layout, type Breakpoint } from '../tokens/index';

/** The width the type and spacing scales were drawn against: an iPhone 14. */
const REFERENCE_WIDTH = 390;
const REFERENCE_HEIGHT = 844;

interface Size {
  width: number;
  height: number;
}

/**
 * A window size that can actually be laid out against.
 *
 * On the web `useWindowDimensions` reports 0 x 0 until something resizes the
 * window: the static export renders in Node, where there is no window at all,
 * and the subscription that would correct it only fires on a resize event that
 * may never come. Anything that multiplied by that width silently produced
 * zero, which is how the floating tab bar ended up 18 pixels wide with its five
 * controls spilling out of it on first load, and stayed that way until the
 * phone was rotated.
 *
 * `innerWidth` is right from the first client frame, so it is read directly
 * rather than waited for. In Node it does not exist and the reference size
 * stands in, which is the size the design was drawn at.
 */
function usable(reported: number, fallback: number, browser: number | undefined): number {
  if (Number.isFinite(reported) && reported > 0) return reported;
  if (typeof browser === 'number' && browser > 0) return browser;
  return fallback;
}

/** The size to lay out against, from what the platform reported. Exported for tests. */
export function resolveWindowSize(reported: Size, browser?: Partial<Size>): Size {
  return {
    width: usable(reported.width, REFERENCE_WIDTH, browser?.width),
    height: usable(reported.height, REFERENCE_HEIGHT, browser?.height),
  };
}

// --- The browser window, read in a way hydration can survive ----------------
//
// The web build is a static export: every page is rendered once in Node, at
// the reference size, and the browser then *hydrates* that HTML. Hydration
// does not repair attributes that differ between the server's render and the
// client's first one. So when the first client render already knew the real
// width, a tablet that opened the app straight on a page kept the phone
// layout from the HTML (Home edge to edge across a 1180px iPad) and resizing
// did not fix it, because React had nothing new to write.
//
// `useSyncExternalStore` is the mechanism React provides for exactly this:
// during hydration it renders with the server snapshot, so the markup matches,
// and right after it re-renders with the real one, so the styles change.

const SERVER_SIZE: Size = { width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT };
let browserSize: Size = SERVER_SIZE;

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function';
}

function readBrowserSize(): Size {
  if (!hasWindow()) return SERVER_SIZE;
  const width = window.innerWidth;
  const height = window.innerHeight;
  // Same object while nothing changed: React compares snapshots by identity
  // and would otherwise re-render forever.
  if (width !== browserSize.width || height !== browserSize.height) {
    browserSize = resolveWindowSize({ width, height });
  }
  return browserSize;
}

function subscribeBrowserSize(onChange: () => void): () => void {
  if (!hasWindow()) return () => {};
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
  };
}

const getServerSize = () => SERVER_SIZE;

/** The window, from whichever source is right on this platform. */
function useWindowSize(): Size {
  // Both hooks run on every platform so the hook order never depends on it.
  const reported = useWindowDimensions();
  const browser = useSyncExternalStore(subscribeBrowserSize, readBrowserSize, getServerSize);
  if (Platform.OS === 'web') return browser;
  return resolveWindowSize(reported);
}

export interface Responsive {
  width: number;
  height: number;
  /** The largest breakpoint the current width satisfies. */
  size: Breakpoint;
  /** 360dp and under – the cheap Androids. Tighten padding, drop decoration. */
  isCompact: boolean;
  /** 600dp and up – large phones in landscape, tablets, web. */
  isMedium: boolean;
  /** 900dp and up. */
  isExpanded: boolean;
  /** Landscape phones need vertical space back. */
  isLandscape: boolean;
  /**
   * Where the menu lives at this size: the floating bar at the bottom on a
   * phone, a rail down the left side on a tablet.
   */
  navigation: 'bar' | 'rail';
  /** The window minus whatever the rail takes. What a screen can actually use. */
  availableWidth: number;
  /** Enough usable width for a dashboard to put two columns side by side. */
  isTwoPane: boolean;
  /** Columns a card grid should use at this width. */
  columns: number;
  /** Width a reading column is clamped to – forms, lists, headers. */
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
 * Everything the layout derives from a window size. Pure, so it can be tested
 * without rendering anything.
 */
export function describeWindow(width: number, height: number): Responsive {
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

  const navigation =
    width >= layout.railMinWidth && height >= layout.railMinHeight ? 'rail' : 'bar';
  const availableWidth = navigation === 'rail' ? width - layout.railWidth : width;

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
    navigation,
    availableWidth,
    isTwoPane: availableWidth >= layout.twoPaneMinWidth,
    columns: isExpanded ? 3 : isMedium ? 2 : 1,
    contentWidth,
    wideContentWidth,
    scale: (value, options) => {
      // 390dp (an iPhone 14) is the width the type scale was drawn against.
      const factor = Math.min(1.15, Math.max(0.88, width / REFERENCE_WIDTH));
      const scaled = Math.round(value * factor);
      const min = options?.min ?? Math.round(value * 0.85);
      const max = options?.max ?? Math.round(value * 1.2);
      return Math.min(max, Math.max(min, scaled));
    },
  };
}

/**
 * One hook every screen uses instead of hard-coding phone widths.
 *
 * The app runs on 360dp Androids, on tablets and on the web from the same
 * source. Without this a card row that fits an iPhone becomes three inches of
 * whitespace on an iPad and overflows on an SE.
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowSize();
  return describeWindow(width, height);
}
