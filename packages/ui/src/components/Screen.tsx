import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { NATIVE_DRIVER } from '../hooks/usePressMotion';
import { useResponsive } from '../hooks/useResponsive';
import { layout, type SpacingToken } from '../tokens/index';

export interface ScreenProps {
  children: ReactNode;
  /** Rendered above the scroll area and pinned – usually a <ScreenHeader />. */
  header?: ReactNode;
  /** Pinned to the bottom, above the safe area – a primary action bar. */
  footer?: ReactNode;
  /** Off when the screen renders its own list (a FlatList owns the scrolling). */
  scroll?: boolean;
  padding?: SpacingToken;
  gap?: SpacingToken;
  /** Adds room for the floating tab bar. On for screens inside (tabs). */
  tabBarSpacing?: boolean;
  /** Passed straight to the ScrollView – pull-to-refresh. */
  refreshControl?: ReactElement<RefreshControlProps>;
  /** Fills the viewport so empty states can centre themselves. */
  grow?: boolean;
  /** Centres the content vertically. Implies `grow`. */
  center?: boolean;
  /**
   * How wide the column may get on a tablet or the web. 'content' is the
   * reading width and the right answer for forms and lists; 'wide' is for
   * screens that lay cards out in a grid.
   */
  width?: 'content' | 'wide';
  background?: 'primary' | 'secondary' | 'surface';
  /**
   * Fades the content in on mount. On by default: a screen that appears fully
   * formed reads as a printout, one that settles reads as an application.
   * Turn it off where something else already owns the entrance.
   */
  animate?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}

/**
 * Every screen starts here.
 *
 * It owns the three things that used to be copy-pasted (and drifted) on each
 * screen: safe-area padding, the keyboard avoider, and – the reason this
 * exists – the responsive column. Above 600dp the content stops stretching and
 * centres inside `layout.maxContentWidth`, so a tablet or a browser window
 * shows a readable column instead of one card three feet wide.
 */
export function Screen({
  children,
  header,
  footer,
  scroll = true,
  padding = 'xl',
  gap = 'xl',
  tabBarSpacing = false,
  refreshControl,
  grow = false,
  center = false,
  width = 'content',
  background = 'primary',
  animate = true,
  contentStyle,
  style,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { isCompact, isMedium } = useResponsive();
  const entrance = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate || reduced) {
      entrance.setValue(1);
      return;
    }
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: theme.motion.base,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [animate, entrance, reduced, theme.motion.base]);
  const columnWidth = width === 'wide' ? layout.maxWideContentWidth : layout.maxContentWidth;
  const fills = grow || center;

  const backgrounds = {
    primary: theme.colors.backgroundPrimary,
    secondary: theme.colors.backgroundSecondary,
    surface: theme.colors.surfacePrimary,
  } as const;

  // Compact phones give a step of horizontal padding back to the content.
  const horizontal = isCompact ? theme.spacing.lg : theme.spacing[padding];

  const bottomPadding =
    (tabBarSpacing
      ? layout.tabBarHeight + layout.tabBarInset + theme.spacing.lg
      : theme.spacing['3xl']) + (footer ? 0 : insets.bottom);

  const column: StyleProp<ViewStyle> = {
    width: '100%',
    maxWidth: isMedium ? columnWidth : undefined,
    alignSelf: 'center',
    gap: theme.spacing[gap],
    justifyContent: center ? 'center' : undefined,
  };

  const entering = {
    opacity: entrance,
    transform: [
      { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
    ],
  };

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[
        {
          paddingHorizontal: horizontal,
          paddingTop: header ? theme.spacing.lg : insets.top + theme.spacing.lg,
          paddingBottom: bottomPadding,
          flexGrow: fills ? 1 : undefined,
        },
        contentStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      <Animated.View style={[column, fills ? { flex: 1 } : null, entering]}>
        {children}
      </Animated.View>
    </ScrollView>
  ) : (
    <View
      style={[
        {
          flex: 1,
          paddingHorizontal: horizontal,
          paddingTop: header ? theme.spacing.lg : insets.top + theme.spacing.lg,
          paddingBottom: bottomPadding,
        },
        contentStyle,
      ]}
    >
      <Animated.View style={[column, { flex: 1 }, entering]}>{children}</Animated.View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[{ flex: 1, backgroundColor: backgrounds[background] }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {header}
      {body}
      {footer ? (
        <View
          style={{
            paddingHorizontal: horizontal,
            paddingTop: theme.spacing.md,
            // Inside (tabs) the floating bar sits on top of this strip, so the
            // action has to clear it or the bar covers the primary button.
            paddingBottom:
              insets.bottom +
              theme.spacing.md +
              (tabBarSpacing ? layout.tabBarHeight + layout.tabBarInset : 0),
            borderTopWidth: 1,
            borderTopColor: theme.colors.borderSubtle,
            backgroundColor: backgrounds[background],
          }}
        >
          <View
            style={{ width: '100%', maxWidth: isMedium ? columnWidth : undefined, alignSelf: 'center' }}
          >
            {footer}
          </View>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
