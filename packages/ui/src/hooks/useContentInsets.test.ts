import { afterEach, describe, expect, it, vi } from 'vitest';
import { spacing } from '../tokens/index';

const reported = { width: 390, height: 844 };

vi.mock('react-native', () => ({
  useWindowDimensions: () => reported,
}));

vi.mock('../theme/ThemeProvider', () => ({
  useTheme: () => ({ spacing }),
}));

const { useContentInsets } = await import('./useContentInsets');

afterEach(() => {
  reported.width = 390;
  reported.height = 844;
});

describe('useContentInsets', () => {
  // The bug this hook exists for: Histórico, Notificações and both Suporte
  // screens pass `padding="none"` because their list owns the scrolling, and
  // then never put the inset back. On any phone wider than 360dp the cards
  // were welded to the sides of the screen.
  it('gives a list the same inset a Screen would have given the content', () => {
    expect(useContentInsets('xl').horizontal).toBe(spacing.xl);
    expect(useContentInsets('xl').column.paddingHorizontal).toBe(spacing.xl);
  });

  // The old rule read `isCompact ? lg : requested`, so a 360dp Android asking
  // for none was handed 16dp while a 390dp iPhone got 0. A narrow screen gives
  // a step of padding back; it never invents one.
  it('tightens padding on a narrow phone and never widens it', () => {
    reported.width = 360;
    expect(useContentInsets('xl').horizontal).toBe(spacing.lg);
    expect(useContentInsets('none').horizontal).toBe(spacing.none);
    expect(useContentInsets('sm').horizontal).toBe(spacing.sm);
  });

  it('leaves an ordinary phone with the padding that was asked for', () => {
    reported.width = 390;
    expect(useContentInsets('none').horizontal).toBe(spacing.none);
    expect(useContentInsets('xl').horizontal).toBe(spacing.xl);
  });

  // Above the medium breakpoint the content stops stretching and centres, the
  // same as it does inside a Screen, so a list on a tablet or the web is a
  // readable column rather than one row three feet wide.
  it('caps and centres the column only once the screen is wide enough', () => {
    reported.width = 390;
    expect(useContentInsets().maxWidth).toBeUndefined();

    reported.width = 900;
    const wide = useContentInsets();
    expect(wide.maxWidth).toBeGreaterThan(0);
    expect(wide.column.alignSelf).toBe('center');
  });
});
