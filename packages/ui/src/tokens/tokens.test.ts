import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance, WCAG_AA_LARGE, WCAG_AA_NORMAL } from './contrast';
import { blue, coral } from './palette';
import { darkTokens, lightTokens, themes } from './semantic';
import { MIN_TOUCH_TARGET, breakpoints, layout, motion, radius, spacing } from './scale';

describe('brand anchors', () => {
  it('uses the exact logo colours at the 500 step', () => {
    expect(blue[500]).toBe('#0137F7');
    expect(coral[500]).toBe('#FF6A54');
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

  // The muted grey used to be neutral 400, which measured 2.86:1 on white and
  // is the "pouco contraste" complaint in token form. It is held to the large
  // -text floor because it only ever carries hints, never body copy.
  it('muted text clears the large-text floor rather than fading out', () => {
    expect(contrastRatio(lightTokens.textMuted, surface)!).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    expect(contrastRatio(lightTokens.textMuted, bg)!).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
  });

  it('borders are visible against the surfaces they divide', () => {
    // 1.35:1 is roughly where a hairline stops reading as a line on a phone
    // held at arm's length in daylight.
    expect(contrastRatio(lightTokens.borderPrimary, surface)!).toBeGreaterThanOrEqual(1.35);
    expect(contrastRatio(lightTokens.borderStrong, surface)!).toBeGreaterThanOrEqual(2);
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

  it('keeps muted text and borders visible on dark surfaces', () => {
    const surface = darkTokens.surfacePrimary;
    expect(contrastRatio(darkTokens.textMuted, surface)!).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    expect(contrastRatio(darkTokens.borderPrimary, surface)!).toBeGreaterThanOrEqual(1.35);
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

describe('inverse surfaces', () => {
  // The tab bar, the hero card and the spotlight tooltip all render type on
  // `surfaceInverse`. If that pair ever fails, navigation becomes unreadable.
  it('keeps text legible on the inverse surface in both themes', () => {
    for (const tokens of [lightTokens, darkTokens]) {
      expect(contrastRatio(tokens.textOnInverse, tokens.surfaceInverse)!).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL,
      );
      // The dimmed variant carries inactive tab labels — large-text floor.
      expect(
        contrastRatio(tokens.textOnInverseMuted, tokens.surfaceInverse)!,
      ).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
    }
  });

  it('keeps the tab bar dark in both themes, with legible labels', () => {
    for (const tokens of [lightTokens, darkTokens]) {
      // Dark in both: a bright bar at the bottom of a night screen is glare.
      expect(relativeLuminance(tokens.navSurface)!).toBeLessThan(0.1);
      expect(contrastRatio(tokens.navText, tokens.navSurface)!).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL,
      );
      expect(
        contrastRatio(tokens.navTextActive, tokens.navSurfaceActive)!,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL);
    }
  });

  it('inverts: the loud surface is dark in light mode and light in dark mode', () => {
    expect(relativeLuminance(lightTokens.surfaceInverse)!).toBeLessThan(
      relativeLuminance(lightTokens.surfacePrimary)!,
    );
    expect(relativeLuminance(darkTokens.surfaceInverse)!).toBeGreaterThan(
      relativeLuminance(darkTokens.surfacePrimary)!,
    );
  });

  it('renders white type legibly on both stops of the hero gradient', () => {
    for (const tokens of [lightTokens, darkTokens]) {
      for (const stop of [tokens.heroFrom, tokens.heroTo, tokens.heroBackFrom, tokens.heroBackTo]) {
        expect(contrastRatio(tokens.textOnBrand, stop)!).toBeGreaterThanOrEqual(WCAG_AA_LARGE);
      }
    }
  });
});

describe('layout scale', () => {
  it('keeps breakpoints ordered', () => {
    const values = Object.values(breakpoints);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });

  it('clamps the reading column to something a person can actually read', () => {
    expect(layout.maxContentWidth).toBeLessThanOrEqual(640);
    expect(layout.maxWideContentWidth).toBeGreaterThan(layout.maxContentWidth);
  });

  it('gives the floating tab bar room for a 44dp target', () => {
    expect(layout.tabBarHeight).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET + 16);
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
