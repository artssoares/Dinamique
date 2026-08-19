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
  /**
   * Azul para TEXTO, separado do azul de preenchimento pelo mesmo motivo que
   * `successText` existe: a cor que preenche um botão e a cor que se lê como
   * letra raramente são a mesma. No escuro, o azul da marca sobre o navy fica
   * em 3.35:1 — bonito num botão, ilegível numa frase.
   */
  brandPrimaryText: string;
  /**
   * A superfície azul da marca — cabeçalhos de entrada, faixas, cartões de
   * destaque. É o mesmo azul nos dois temas de propósito: o manual trata o
   * azul como a assinatura da marca, não como uma cor de interface que troca
   * junto com o tema.
   */
  brandSurface: string;
  /** Texto de apoio sobre `brandSurface`. Passa AA sobre o azul da marca. */
  textOnBrandMuted: string;
  brandSecondary: string;
  brandSecondaryHover: string;
  brandSecondarySubtle: string;

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
  surfaceSecondary: neutral[25],
  surfaceElevated: neutral[0],
  surfaceHover: neutral[100],

  textPrimary: neutral[900],
  textSecondary: neutral[600],
  textMuted: neutral[400],
  textInverse: neutral[0],
  textOnBrand: neutral[0],
  textOnBrandMuted: blue[50],

  borderPrimary: neutral[200],
  borderSubtle: neutral[100],
  borderStrong: neutral[300],

  brandPrimary: blue[500],
  brandPrimaryHover: blue[600],
  brandPrimarySubtle: blue[50],
  brandPrimaryText: blue[500],
  brandSurface: blue[500],
  brandSecondary: coral[500],
  brandSecondaryHover: coral[600],
  brandSecondarySubtle: coral[50],

  success: green[500],
  successSubtle: green[50],
  successText: green[600],
  danger: red[500],
  dangerSubtle: red[50],
  dangerText: red[600],
  warning: amber[500],
  warningSubtle: amber[50],
  warningText: amber[700],

  overlay: 'rgba(3, 9, 59, 0.55)',
  skeleton: neutral[100],
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
  surfaceElevated: neutral[800],
  surfaceHover: neutral[800],

  textPrimary: neutral[50],
  textSecondary: neutral[400],
  textMuted: neutral[500],
  textInverse: neutral[950],
  textOnBrand: neutral[0],
  textOnBrandMuted: blue[50],

  borderPrimary: neutral[800],
  borderSubtle: neutral[850],
  borderStrong: neutral[700],

  brandPrimary: blue[400],
  brandPrimaryHover: blue[500],
  brandPrimarySubtle: 'rgba(26, 108, 249, 0.18)',
  brandPrimaryText: blue[300],
  brandSurface: blue[500],
  brandSecondary: coral[400],
  brandSecondaryHover: coral[300],
  brandSecondarySubtle: 'rgba(253, 129, 124, 0.18)',

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
  skeleton: neutral[800],
  focusRing: blue[300],
};

export type ColorSchemeName = 'light' | 'dark';

export const themes: Record<ColorSchemeName, ThemeTokens> = {
  light: lightTokens,
  dark: darkTokens,
};
