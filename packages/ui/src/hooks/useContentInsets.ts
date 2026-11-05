import type { ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { layout, type SpacingToken } from '../tokens/index';
import { useResponsive } from './useResponsive';

export interface ContentInsets {
  /** The horizontal padding a screen puts between its content and the edge. */
  horizontal: number;
  /** The reading column cap, or undefined below the medium breakpoint. */
  maxWidth: number | undefined;
  /**
   * Ready to drop into a list's `contentContainerStyle`: the same inset and the
   * same centred column a `Screen` would have given the content.
   */
  column: ViewStyle;
}

export type ColumnWidth = 'content' | 'wide' | 'dashboard';

/**
 * How wide a screen's column may get.
 *
 * - `content`: the reading width. Forms, lists, settings.
 * - `wide`: card grids, which tolerate a little more.
 * - `dashboard`: Home, Histórico, Insights. On a tablet lying down these split
 *   into two columns (`Columns`) and take the room; anywhere narrower they are
 *   an ordinary reading column, because one card stretched across a tablet
 *   held upright is not a dashboard, just a wide card.
 */
export function columnMaxWidth(
  width: ColumnWidth,
  screen: { isMedium: boolean; isTwoPane: boolean },
): number | undefined {
  if (!screen.isMedium) return undefined;
  if (width === 'dashboard') {
    return screen.isTwoPane ? layout.maxDashboardWidth : layout.maxContentWidth;
  }
  return width === 'wide' ? layout.maxWideContentWidth : layout.maxContentWidth;
}

/**
 * Where a screen's content stops and its edge begins.
 *
 * `Screen` owns this for anything that scrolls inside it, but a screen whose
 * list owns the scrolling passes `scroll={false} padding="none"` and then has
 * to put the inset back itself, on the list's content container, so the
 * scrollbar stays at the edge while the rows do not. Four screens did the
 * first half and none did the second, which is why Histórico, Notificações and
 * os dois de Suporte had their cards welded to the sides of the phone.
 *
 * It is a hook rather than a number so there is one rule instead of four
 * copies of a 20 that drift apart the first time somebody changes it.
 */
export function useContentInsets(
  padding: SpacingToken = 'xl',
  width: ColumnWidth = 'content',
): ContentInsets {
  const theme = useTheme();
  const { isCompact, isMedium, isTwoPane } = useResponsive();

  const requested = theme.spacing[padding];
  // A narrow phone gives a step of padding back to the content. A step back,
  // never a step up: asking for `none` and being handed 16dp on a 360dp
  // Android while a 390dp iPhone got 0 was the bug underneath all of this.
  const horizontal = isCompact ? Math.min(requested, theme.spacing.lg) : requested;

  const maxWidth = columnMaxWidth(width, { isMedium, isTwoPane });

  return {
    horizontal,
    maxWidth,
    column: { paddingHorizontal: horizontal, width: '100%', maxWidth, alignSelf: 'center' },
  };
}
