/**
 * WCAG contrast helpers. Used by the token test suite so an accessibility
 * regression fails CI instead of shipping (§116).
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = Number.parseInt(match[1]!, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/**
 * Parses `#rrggbb`, `rgb(...)` and `rgba(...)`. The dark theme's subtle
 * backgrounds are low-alpha overlays rather than solid tints, so measuring one
 * means knowing its alpha.
 */
export function parseColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const solid = hexToRgb(value);
  if (solid) return { ...solid, a: 1 };

  const match = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    value.trim(),
  );
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/**
 * Composites a colour over the surface behind it and returns the solid result.
 *
 * A translucent wash has no contrast ratio of its own: what the eye sees is the
 * blend. In dark mode every `*Subtle` token is such a wash, so without this the
 * tinted tiles could only be asserted in light mode, which is the theme they
 * are least likely to fail in.
 */
export function flatten(color: string, backdrop: string): string | null {
  const top = parseColor(color);
  const base = parseColor(backdrop);
  if (!top || !base) return null;

  const mix = (a: number, b: number) => Math.round(a * top.a + b * (1 - top.a));
  const pair = (value: number) => value.toString(16).padStart(2, '0');
  return `#${pair(mix(top.r, base.r))}${pair(mix(top.g, base.g))}${pair(mix(top.b, base.b))}`;
}

/** Returns null for non-hex values such as the rgba() overlays. */
export function contrastRatio(foreground: string, background: string): number | null {
  const lf = relativeLuminance(foreground);
  const lb = relativeLuminance(background);
  if (lf === null || lb === null) return null;
  const lighter = Math.max(lf, lb);
  const darker = Math.min(lf, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export const WCAG_AA_NORMAL = 4.5;
export const WCAG_AA_LARGE = 3;
