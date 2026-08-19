/**
 * Spacing, radius, typography and motion scales.
 *
 * Spacing is a 4pt grid. Radii are generous but stop short of pill-shaped for
 * anything that isn't a chip or a button (§14).
 */

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 56,
  '6xl': 72,
} as const;

export type SpacingToken = keyof typeof spacing;

export const radius = {
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

/**
 * Type scale. Financial figures get their own oversized steps because the
 * number must land before anything else on the screen (§15).
 */
export const typography = {
  displayXl: { fontSize: 48, lineHeight: 52, fontWeight: '700' },
  display: { fontSize: 40, lineHeight: 44, fontWeight: '700' },
  /** The hero currency figure on Home. */
  moneyHero: { fontSize: 36, lineHeight: 40, fontWeight: '700' },
  moneyLarge: { fontSize: 28, lineHeight: 32, fontWeight: '700' },
  moneyMedium: { fontSize: 22, lineHeight: 26, fontWeight: '600' },
  titleLg: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  subtitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  captionStrong: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.6 },
} as const;

export type TypographyToken = keyof typeof typography;

/**
 * Elevation is soft — depth comes from spacing first. `xl` exists only for the
 * two things that genuinely float above the page: the tab bar and the hero
 * card stack.
 */
export const elevation = {
  none: { shadowOpacity: 0, elevation: 0 },
  sm: { shadowColor: '#0D1016', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  md: { shadowColor: '#0D1016', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  lg: { shadowColor: '#0D1016', shadowOpacity: 0.1, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  xl: { shadowColor: '#0D1016', shadowOpacity: 0.16, shadowRadius: 36, shadowOffset: { width: 0, height: 18 }, elevation: 12 },
} as const;

/** Motion: short and purposeful. Nothing above 400ms (§18). */
export const motion = {
  instant: 90,
  fast: 160,
  base: 240,
  slow: 340,
  /** Count-up animation for currency figures. */
  counter: 700,
} as const;

/** Minimum touch target, in dp — accessibility floor (§116). */
export const MIN_TOUCH_TARGET = 44;

/**
 * Width breakpoints. The app is phone-first, but it also runs on tablets and
 * on the web, where a column of full-width cards 1200px across is unreadable.
 * Everything above `md` centres inside `layout.maxContentWidth` instead.
 */
export const breakpoints = {
  /** Small phones — iPhone SE and the cheap Androids most drivers carry. */
  compact: 360,
  /** Ordinary phones. */
  regular: 400,
  /** Large phones and small tablets in portrait. */
  medium: 600,
  /** Tablets, desktop web. */
  expanded: 900,
} as const;

export type Breakpoint = keyof typeof breakpoints;

export const layout = {
  /** A reading column never wider than this, whatever the screen is. */
  maxContentWidth: 560,
  /** Two-column card grids get more room before they look sparse. */
  maxWideContentWidth: 760,
  /** Height of the floating tab bar, used to pad screens that scroll under it. */
  tabBarHeight: 68,
  /** Gap between the tab bar and the bottom safe area. */
  tabBarInset: 12,
} as const;
