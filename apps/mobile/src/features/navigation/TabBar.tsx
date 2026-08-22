import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  CountBadge,
  Icon,
  Text,
  layout,
  useReducedMotion,
  useResponsive,
  useTheme,
  type IconName,
} from '@dinamique/ui';
import { useTourTarget } from '@/features/tour/TourProvider';

interface TabConfig {
  name: string;
  label: string;
  icon: IconName;
  /** The centre action: always filled, always the same size, never a pill. */
  centre?: boolean;
}

const TABS: TabConfig[] = [
  { name: 'index', label: 'Hoje', icon: 'home' },
  { name: 'history', label: 'Histórico', icon: 'history' },
  { name: 'record', label: 'Registrar', icon: 'plus', centre: true },
  { name: 'insights', label: 'Insights', icon: 'insights' },
  { name: 'more', label: 'Mais', icon: 'more' },
];

/** Diameter of a collapsed control, and of the centre action in every state. */
const DIAMETER = 48;
const ICON_SIZE = 21;
/** Keeps the icon centred in the circle while the pill grows to its right. */
const ICON_INSET = Math.round((DIAMETER - ICON_SIZE) / 2);

export interface TabBarProps extends BottomTabBarProps {
  /** Unread count shown on "Mais". */
  badge?: number;
}

/**
 * The floating tab bar.
 *
 * It replaces the default bar – a full-width strip with a hairline border and
 * unicode glyphs for icons. This one is a single rounded surface that floats
 * clear of the bottom edge, and only the active destination carries its label,
 * which is what lets five destinations fit without crowding.
 *
 * The active pill grows to make room for that label. Getting it to move
 * smoothly took two fixes that are easy to get wrong:
 *
 *   1. **One driver per node.** The press spring ran on the native driver and
 *      the width spring on the JavaScript one, both on the same view. React
 *      Native moves a node to the native thread the first time a native-driven
 *      animation touches it, and every JavaScript-driven update to that node
 *      afterwards is refused. The press transform now lives on its own view,
 *      outside the one that animates width and colour.
 *   2. **Nothing mounts, nothing reflows.** The label used to be mounted only
 *      while focused, and the pill's `flexGrow`, padding and gap all flipped
 *      the instant focus changed, so a layout jump raced the animation. The
 *      label is always mounted and measured once; a single spring drives the
 *      width, the fill and the label's opacity together.
 */
export function TabBar({ state, navigation, badge = 0 }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isCompact, contentWidth } = useResponsive();
  // The bar stops growing well before the content column does. Five controls
  // spread across 560dp read as five separate buttons, not as one bar.
  const barWidth = Math.min(contentWidth, 420);

  const activeRoute = state.routes[state.index]?.name;

  return (
    <View
      // The bar floats; taps outside it must still reach the screen behind.
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: Math.max(insets.bottom, theme.spacing.md),
        paddingHorizontal: isCompact ? theme.spacing.md : theme.spacing.lg,
        alignItems: 'center',
      }}
    >
      <View
        style={[
          {
            width: '100%',
            maxWidth: barWidth,
            height: layout.tabBarHeight,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: theme.spacing.sm,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.navSurface,
            // In dark mode the bar and the page are both near-black and the
            // drop shadow is invisible, so the edge has to be drawn.
            borderWidth: 1,
            borderColor: theme.colors.borderSubtle,
          },
          theme.elevation.xl,
        ]}
      >
        {TABS.map((tab) => {
          const route = state.routes.find((item) => item.name === tab.name);
          if (!route) return null;

          const focused = activeRoute === tab.name;

          return (
            <TabItem
              key={tab.name}
              tab={tab}
              focused={focused}
              badge={tab.name === 'more' ? badge : 0}
              compact={isCompact}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({
  tab,
  focused,
  badge,
  compact,
  onPress,
}: {
  tab: TabConfig;
  focused: boolean;
  badge: number;
  compact: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  // Anchors the coach mark that says "use o + para lançar ganhos e gastos".
  const tourTarget = useTourTarget(`tab-${tab.name}`);

  // Two values, two nodes. See the note on the component above: a node that a
  // native-driven animation has touched cannot be updated from JavaScript.
  const press = useRef(new Animated.Value(0)).current;
  const expansion = useRef(new Animated.Value(focused ? 1 : 0)).current;

  // Measured once, from the label itself. Guessing it from the character count
  // is wrong on the first device with a different font.
  const [labelWidth, setLabelWidth] = useState(0);

  // A compact phone has no room for the label, so the pill never grows there
  // and the spring has nothing to do.
  const expands = !tab.centre && !compact && labelWidth > 0;
  const expandedWidth = DIAMETER + theme.spacing.sm + labelWidth + theme.spacing.lg;

  useEffect(() => {
    if (reduced) {
      expansion.setValue(focused ? 1 : 0);
      return;
    }
    // A spring rather than a curve: the pill overshoots by a hair and settles,
    // which is what reads as the selection moving rather than redrawing.
    const animation = Animated.spring(expansion, {
      toValue: focused ? 1 : 0,
      damping: 20,
      stiffness: 220,
      mass: 0.7,
      // Width and colour cannot be driven from the native thread.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [expansion, focused, reduced]);

  function springPress(to: number) {
    if (reduced) return;
    Animated.spring(press, {
      toValue: to,
      damping: 15,
      stiffness: 400,
      mass: 0.5,
      useNativeDriver: true,
    }).start();
  }

  function onLabelLayout(event: LayoutChangeEvent) {
    const width = Math.ceil(event.nativeEvent.layout.width);
    if (width > 0 && width !== labelWidth) setLabelWidth(width);
  }

  // The centre action keeps the brand fill in every state: it is the thing the
  // app is for, and it should never look like it switched off.
  const background = tab.centre
    ? theme.colors.brandPrimary
    : expansion.interpolate({
        inputRange: [0, 1],
        outputRange: ['rgba(0,0,0,0)', theme.colors.navSurfaceActive],
      });

  const iconColor = tab.centre
    ? theme.colors.textOnBrand
    : focused
      ? theme.colors.navTextActive
      : theme.colors.navText;

  return (
    <Pressable
      ref={tourTarget.ref}
      collapsable={false}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      onPress={onPress}
      onPressIn={() => springPress(1)}
      onPressOut={() => springPress(0)}
    >
      {/* Node one: the press. Native driver, transform only. */}
      <Animated.View
        style={{
          transform: [
            { scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }) },
            // The centre action turns an eighth of a turn as it is pressed, so
            // the plus acknowledges the tap before the screen has changed.
            {
              rotate: tab.centre
                ? press.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] })
                : '0deg',
            },
          ],
        }}
      >
        {/* Node two: the pill. JavaScript driver, width and colour. */}
        <Animated.View
          style={{
            width: expands
              ? expansion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [DIAMETER, expandedWidth],
                })
              : DIAMETER,
            height: DIAMETER,
            borderRadius: theme.radius.pill,
            backgroundColor: background,
            flexDirection: 'row',
            alignItems: 'center',
            // The icon keeps the circle's own padding, so it stays put while
            // the pill grows to its right instead of drifting across it.
            justifyContent: tab.centre ? 'center' : 'flex-start',
            paddingLeft: tab.centre ? 0 : ICON_INSET,
            overflow: 'hidden',
          }}
        >
          {/* `flexShrink: 0` is not decoration. The label sits beside the icon
              and is wider than a collapsed pill, so without it flexbox shrinks
              whichever sibling it can, and on the web that is the icon: every
              inactive destination rendered as an empty circle. */}
          <View style={{ flexShrink: 0 }}>
            <Icon name={tab.icon} size={tab.centre ? 24 : ICON_SIZE} color={iconColor} />
          </View>

          {/* Always mounted, so focus never triggers a mount and a reflow. It
              is clipped by the pill until the pill is wide enough to hold it,
              and only then does it fade in. */}
          {tab.centre ? null : (
            <Animated.View
              style={{
                flexShrink: 0,
                paddingLeft: theme.spacing.sm,
                opacity: expansion.interpolate({
                  inputRange: [0, 0.55, 1],
                  outputRange: [0, 0, 1],
                }),
              }}
            >
              <Text
                variant="captionStrong"
                onLayout={onLabelLayout}
                numberOfLines={1}
                style={{ color: iconColor }}
              >
                {tab.label}
              </Text>
            </Animated.View>
          )}

          {/* The centre action keeps its fill in every state, so "you are here"
              has to be said with a ring instead of a colour change. */}
          {tab.centre && focused ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 2,
                left: 2,
                right: 2,
                bottom: 2,
                borderRadius: theme.radius.pill,
                borderWidth: 2,
                borderColor: theme.colors.navSurfaceActive,
              }}
            />
          ) : null}
        </Animated.View>

        {badge > 0 ? (
          <CountBadge count={badge} style={{ position: 'absolute', top: 0, right: 0 }} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
