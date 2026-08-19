import { describe, expect, it } from 'vitest';
import { contrastRatio, WCAG_AA_LARGE, WCAG_AA_NORMAL } from './contrast';
import { blue, coral, neutral } from './palette';
import { darkTokens, lightTokens, themes } from './semantic';
import { MIN_TOUCH_TARGET, motion, radius, spacing } from './scale';

describe('brand anchors', () => {
  it('uses the exact brand-manual colours at the 500 step', () => {
    // Mini manual de marca V1.0: Dinamique Blue e Coral Point.
    expect(blue[500]).toBe('#065DF7');
    expect(coral[500]).toBe('#FD6561');
  });

  it('anchors the dark end of the neutral ramp on Midnight Navy', () => {
    expect(neutral[950]).toBe('#03093B');
  });
});

describe('light mode contrast (§116)', () => {
  const bg = lightTokens.backgroundPrimary;
  const surface = lightTokens.surfacePrimary;

  it('body text passes AA on background and surface', () => {
    expect(contrastRatio(lightTokens.textPrimary, bg)!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    expect(contrastRatio(lightTokens.textPrimary, surface)!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('secondary text passes AA on surface', () => {
    expect(contrastRatio(lightTokens.textSecondary, surface)!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('white text passes AA on the brand blue fill', () => {
    expect(contrastRatio(lightTokens.textOnBrand, lightTokens.brandPrimary)!).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL,
    );
  });

  it('semantic text colours pass AA on their subtle backgrounds and on white', () => {
    const pairs = [
      [lightTokens.successText, lightTokens.successSubtle],
      [lightTokens.dangerText, lightTokens.dangerSubtle],
      [lightTokens.warningText, lightTokens.warningSubtle],
    ] as const;

    for (const [text, background] of pairs) {
      expect(contrastRatio(text, background)!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
      expect(contrastRatio(text, surface)!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    }
  });

  it('semantic fills stay distinguishable against the surface they sit on', () => {
    expect(contrastRatio(lightTokens.success, surface)!).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    expect(contrastRatio(lightTokens.danger, surface)!).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
  });
});

describe('dark mode contrast (§17)', () => {
  const bg = darkTokens.backgroundPrimary;

  it('never uses absolute black', () => {
    expect(darkTokens.backgroundPrimary).not.toBe('#000000');
    expect(darkTokens.surfacePrimary).not.toBe('#000000');
  });

  it('body and secondary text pass AA', () => {
    expect(contrastRatio(darkTokens.textPrimary, bg)!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    expect(contrastRatio(darkTokens.textSecondary, darkTokens.surfacePrimary)!).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL,
    );
  });

  it('keeps semantic text readable on dark surfaces', () => {
    const surface = darkTokens.surfacePrimary;
    expect(contrastRatio(darkTokens.successText, surface)!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    expect(contrastRatio(darkTokens.dangerText, surface)!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    expect(contrastRatio(darkTokens.warningText, surface)!).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
  });

  it('keeps the brand colours readable as text on dark surfaces', () => {
    expect(contrastRatio(darkTokens.brandPrimary, darkTokens.surfacePrimary)!).toBeGreaterThanOrEqual(
      WCAG_AA_LARGE,
    );
    expect(contrastRatio(darkTokens.brandSecondary, darkTokens.surfacePrimary)!).toBeGreaterThanOrEqual(
      WCAG_AA_LARGE,
    );
  });
});

describe('token completeness', () => {
  it('defines every semantic key in both themes', () => {
    expect(Object.keys(themes.dark).sort()).toEqual(Object.keys(themes.light).sort());
  });

  it('keeps a 4pt spacing grid', () => {
    for (const value of Object.values(spacing)) {
      expect(value % 2).toBe(0);
    }
  });

  it('keeps motion short enough not to feel sluggish (§18)', () => {
    for (const value of Object.values(motion)) {
      expect(value).toBeLessThanOrEqual(700);
    }
    expect(motion.base).toBeLessThanOrEqual(300);
  });

  it('meets the minimum touch target', () => {
    expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
    expect(radius.pill).toBeGreaterThan(radius['3xl']);
  });
});
