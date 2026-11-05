import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import type { SpacingToken } from '../tokens/index';

export interface ColumnsProps {
  /** What leads: on a phone it comes first, on a tablet it sits on the left. */
  primary: ReactNode;
  /** What follows: below on a phone, on the right on a tablet. */
  secondary: ReactNode;
  /** Gap between the columns and between the sections inside each one. */
  gap?: SpacingToken;
  /** How much of the width the left column takes, against `secondaryFlex`. */
  primaryFlex?: number;
  secondaryFlex?: number;
}

/**
 * A dashboard that is one column on a phone and two on a tablet lying down.
 *
 * On a phone it renders nothing of its own: both groups go straight into the
 * parent, which keeps spacing them with its own gap, so the phone layout is
 * exactly what it was before this existed. Only when `isTwoPane` holds do the
 * groups become two columns side by side, each with its own gap.
 *
 * Use it inside a `Screen width="dashboard"`, which is what lets the content
 * get wide enough for two columns in the first place.
 */
export function Columns({
  primary,
  secondary,
  gap = 'xl',
  primaryFlex = 1,
  secondaryFlex = 1,
}: ColumnsProps) {
  const theme = useTheme();
  const { isTwoPane } = useResponsive();

  if (!isTwoPane) {
    return (
      <>
        {primary}
        {secondary}
      </>
    );
  }

  const space = theme.spacing[gap];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space }}>
      {/* `minWidth: 0` lets a column narrower than its widest child shrink
          instead of pushing the other one off the screen. */}
      <View style={{ flex: primaryFlex, minWidth: 0, gap: space }}>{primary}</View>
      <View style={{ flex: secondaryFlex, minWidth: 0, gap: space }}>{secondary}</View>
    </View>
  );
}
