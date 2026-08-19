import { amber, blue, coral, green, neutral, red } from './palette';

/**
 * Semantic design tokens (§16). Components consume ONLY these names — a raw
 * hex in a component is a bug, because it cannot follow the theme.
 */
export interface ThemeTokens {
  /* surfaces */
  backgroundPrimary: string;
  backgroundSecondary: string;
  surfacePrimary: string;
  surfaceSecondary: string;
  surfaceElevated: string;
  /** Pressed/hover wash over a surface. */
  surfaceHover: string;

  /* inverse — the dark, high-contrast surfaces: navigation bar, hero card,
     spotlight tooltips. In dark mode they invert to near-white so the same
     component keeps its "this is the loud one" role in both themes. */
  surfaceInverse: string;
  surfaceInverseHover: string;
  textOnInverse: string;
  textOnInverseMuted: string;

  /* navigation — the floating tab bar. Unlike `surfaceInverse` these do NOT
     invert: a white bar glowing at the bottom of a dark screen is glare in a
     car at night, which is exactly when this app is open. */
  navSurface: string;
  navSurfaceActive: string;
  navText: string;
  navTextActive: string;

  /* content */
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  /** Text that sits on a brand-filled surface. */
  textOnBrand: string;

  /* lines */
  borderPrimary: string;
  borderSubtle: string;
  borderStrong: string;

  /* brand */
  brandPrimary: string;
  brandPrimaryHover: string;
  brandPrimarySubtle: string;
  brandSecondary: string;
  brandSecondaryHover: string;
  brandSecondarySubtle: string;

  /* hero — the two stops of the headline card's gradient. Same hue family as
     the brand; never an independently chosen colour (§138). */
  heroFrom: string;
  heroTo: string;
  /** Second card in the stack, peeking out behind the hero. */
  heroBackFrom: string;
  heroBackTo: string;

  /* semantic — meaning only, never decoration (§13).
     `success`/`danger`/`warning` are FILL colours (bars, dots, badges).
     The `*Text` variants are the only ones safe to render type in, because a
     colour vivid enough to fill a shape rarely clears AA as small text. */
  success: string;
  successSubtle: string;
  successText: string;
  danger: string;
  dangerSubtle: string;
  dangerText: string;
  warning: string;
  warningSubtle: string;
  warningText: string;

  /* utility */
  overlay: string;
  /** Darker scrim used behind the spotlight tour, so the cut-out reads. */
  overlayStrong: string;
  skeleton: string;
  focusRing: string;
}

/**
 * Light is the default and dominant mode: lots of white, off-white surfaces,
 * very soft greys, blue used with intent (§12).
 */
export const lightTokens: ThemeTokens = {
  backgroundPrimary: neutral[50],
  backgroundSecondary: neutral[100],
  surfacePrimary: neutral[0],
  surfaceSecondary: neutral[100],
  surfaceElevated: neutral[0],
  surfaceHover: neutral[100],

  surfaceInverse: neutral[900],
  surfaceInverseHover: neutral[800],
  textOnInverse: neutral[0],
  textOnInverseMuted: neutral[300],

  navSurface: neutral[900],
  navSurfaceActive: neutral[0],
  navText: neutral[300],
  navTextActive: neutral[900],

  textPrimary: neutral[900],
  textSecondary: neutral[600],
  // 500 rather than 400: the old muted grey measured 2.6:1 on white, which is
  // the "pouco contraste" complaint in token form.
  textMuted: neutral[500],
  textInverse: neutral[0],
  textOnBrand: neutral[0],

  borderPrimary: neutral[300],
  borderSubtle: neutral[200],
  borderStrong: neutral[400],

  brandPrimary: blue[500],
  brandPrimaryHover: blue[600],
  brandPrimarySubtle: blue[50],
  brandSecondary: coral[500],
  brandSecondaryHover: coral[600],
  brandSecondarySubtle: coral[50],

  heroFrom: blue[600],
  heroTo: blue[400],
  // Coral 700→600 rather than 500→400: the card carries white type, and the
  // lighter steps measure 2.4:1 against it. Asserted in the token test.
  heroBackFrom: coral[700],
  heroBackTo: coral[600],

  success: green[500],
  successSubtle: green[50],
  successText: green[600],
  danger: red[500],
  dangerSubtle: red[50],
  dangerText: red[600],
  warning: amber[500],
  warningSubtle: amber[50],
  warningText: amber[700],

  overlay: 'rgba(13, 16, 22, 0.45)',
  overlayStrong: 'rgba(13, 16, 22, 0.78)',
  skeleton: neutral[200],
  focusRing: blue[400],
};

/**
 * Dark mode uses very dark blue-neutrals rather than absolute black, and lifts
 * the brand steps so they stay legible without glowing (§17).
 */
export const darkTokens: ThemeTokens = {
  backgroundPrimary: neutral[950],
  backgroundSecondary: neutral[900],
  surfacePrimary: neutral[900],
  surfaceSecondary: neutral[850],
  surfaceElevated: neutral[850],
  surfaceHover: neutral[800],

  // Inverted: on a dark app the loud surface is the light one.
  surfaceInverse: neutral[100],
  surfaceInverseHover: neutral[200],
  textOnInverse: neutral[950],
  textOnInverseMuted: neutral[600],

  navSurface: neutral[850],
  navSurfaceActive: neutral[50],
  navText: neutral[300],
  navTextActive: neutral[950],

  textPrimary: neutral[50],
  textSecondary: neutral[300],
  textMuted: neutral[400],
  textInverse: neutral[950],
  textOnBrand: neutral[0],

  borderPrimary: neutral[700],
  borderSubtle: neutral[800],
  borderStrong: neutral[600],

  brandPrimary: blue[400],
  brandPrimaryHover: blue[300],
  brandPrimarySubtle: 'rgba(74, 113, 255, 0.16)',
  brandSecondary: coral[400],
  brandSecondaryHover: coral[300],
  brandSecondarySubtle: 'rgba(255, 134, 111, 0.16)',

  heroFrom: blue[600],
  heroTo: blue[400],
  heroBackFrom: coral[700],
  heroBackTo: coral[600],

  success: green[400],
  successSubtle: 'rgba(52, 199, 123, 0.16)',
  successText: green[400],
  danger: red[400],
  dangerSubtle: 'rgba(242, 98, 107, 0.16)',
  dangerText: red[400],
  warning: amber[400],
  warningSubtle: 'rgba(255, 176, 32, 0.16)',
  warningText: amber[400],

  overlay: 'rgba(0, 0, 0, 0.62)',
  overlayStrong: 'rgba(0, 0, 0, 0.82)',
  skeleton: neutral[800],
  focusRing: blue[300],
};

export type ColorSchemeName = 'light' | 'dark';

export const themes: Record<ColorSchemeName, ThemeTokens> = {
  light: lightTokens,
  dark: darkTokens,
};
