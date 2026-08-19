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
/**
 * Tipografia — mini manual de marca V1.0, §04.
 *
 * O manual é explícito: o logotipo é uma assinatura própria e a interface usa
 * uma família neutra e digital, Inter, "para manter legibilidade em telas
 * pequenas, tabelas, dashboards e fluxos de cadastro". A hierarquia abaixo é a
 * do manual — título 28–36 Bold, subtítulo 18–22 SemiBold, corpo 14–16
 * Regular, botão 14–16 SemiBold, dados 16–24 Medium.
 *
 * A pilha termina em fontes do próprio sistema: se a Inter não carregar, o
 * texto continua com a mesma métrica em vez de cair numa serifada.
 */
export const fontFamily =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const typography = {
  displayXl: { fontSize: 44, lineHeight: 48, fontWeight: '700', letterSpacing: -1.2 },
  display: { fontSize: 36, lineHeight: 40, fontWeight: '700', letterSpacing: -0.9 },
  /** The hero currency figure on Home. */
  moneyHero: { fontSize: 36, lineHeight: 40, fontWeight: '700', letterSpacing: -0.9 },
  moneyLarge: { fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  moneyMedium: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3 },
  titleLg: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.7 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 18, lineHeight: 25, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 23, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  captionStrong: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8 },
} as const;

export type TypographyToken = keyof typeof typography;

/** Elevation is deliberately soft — depth comes from spacing, not drop shadows. */
export const elevation = {
  none: { shadowOpacity: 0, elevation: 0 },
  sm: { shadowColor: '#0D1016', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  md: { shadowColor: '#0D1016', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  lg: { shadowColor: '#0D1016', shadowOpacity: 0.1, shadowRadius: 28, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
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
