import { useRef } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CountBadge, Icon, Text, layout, useReducedMotion, useTheme } from '@dinamique/ui';
import { useTourTarget } from '@/features/tour/TourProvider';
import { TABS, type TabConfig, type TabBarSurfaceProps } from './TabBar';

/** Width of the pill itself. The rest of `layout.railWidth` is its margin. */
const RAIL_WIDTH = 76;
const DIAMETER = 48;

/**
 * The menu on a tablet: the same five destinations, down the left side.
 *
 * A bar along the bottom is right for a phone held in one hand. On a tablet
 * it is a strip of five buttons floating over the middle of the content, and
 * with the tablet lying in a dashboard mount it takes height the screen has
 * least of. The rail gives that height back and sits on the side nearest the
 * driver (the left, in a car driven from the left seat).
 *
 * It is the bar turned on its side rather than a different control: the same
 * dark pill, the same order, the brand-filled centre action, the same badge.
 * What changes is that every destination carries its label, because a tablet
 * has the room and the driver should not have to learn icons.
 *
 * The root layout draws one rail for the whole app, beside the stack, so it
 * stays put while screens slide in next to it.
 */
export function NavigationRail({
  activeName,
  onSelect,
  badge = 0,
  anchorTour = true,
}: TabBarSurfaceProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        width: layout.railWidth + insets.left,
        paddingLeft: insets.left,
        backgroundColor: theme.colors.backgroundPrimary,
      }}
    >
      {/* Scrolls only if the window is shorter than the five destinations,
          which `railMinHeight` should already rule out. Better a rail that
          scrolls than a destination nobody can reach. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: insets.top + theme.spacing.md,
          paddingBottom: insets.bottom + theme.spacing.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          accessibilityRole="tablist"
          style={[
            {
              width: RAIL_WIDTH,
              paddingVertical: theme.spacing.md,
              gap: theme.spacing.sm,
              alignItems: 'center',
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.navSurface,
              // Same reason as the bar: in dark mode the shadow is invisible
              // against the page, so the edge is drawn.
              borderWidth: 1,
              borderColor: theme.colors.borderSubtle,
            },
            theme.elevation.xl,
          ]}
        >
          {TABS.map((tab) => (
            <RailItem
              key={tab.name}
              tab={tab}
              focused={activeName === tab.name}
              badge={tab.name === 'more' ? badge : 0}
              anchorTour={anchorTour}
              onPress={() => onSelect(tab.name)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function RailItem({
  tab,
  focused,
  badge,
  anchorTour,
  onPress,
}: {
  tab: TabConfig;
  focused: boolean;
  badge: number;
  anchorTour: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  // The tour keys its anchors by name, so the rail points the coach marks at
  // itself exactly as the bar does on a phone.
  const tourTarget = useTourTarget(`tab-${tab.name}`);
  const press = useRef(new Animated.Value(0)).current;

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

  const circle = tab.centre
    ? theme.colors.brandPrimary
    : focused
      ? theme.colors.navSurfaceActive
      : 'transparent';

  const iconColor = tab.centre
    ? theme.colors.textOnBrand
    : focused
      ? theme.colors.navTextActive
      : theme.colors.navText;

  // Under the circle the pill is still dark, so the label is the light nav
  // colour in both states; focus is said by the circle and the weight.
  const labelColor = focused ? theme.colors.navSurfaceActive : theme.colors.navText;

  return (
    <Pressable
      ref={anchorTour ? tourTarget.ref : undefined}
      collapsable={false}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      onPress={onPress}
      onPressIn={() => springPress(1)}
      onPressOut={() => springPress(0)}
      style={{ width: RAIL_WIDTH, alignItems: 'center', paddingVertical: theme.spacing.xs }}
    >
      <Animated.View
        style={{
          alignItems: 'center',
          gap: theme.spacing.xs,
          transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }],
        }}
      >
        <View
          style={{
            width: DIAMETER,
            height: DIAMETER,
            borderRadius: theme.radius.pill,
            backgroundColor: circle,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: tab.centre
                    ? press.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] })
                    : '0deg',
                },
              ],
            }}
          >
            <Icon name={tab.icon} size={tab.centre ? 24 : 21} color={iconColor} />
          </Animated.View>

          {/* The centre action keeps its fill in every state, so "you are
              here" is a ring, as on the bar. */}
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

          {badge > 0 ? (
            <CountBadge count={badge} style={{ position: 'absolute', top: -2, right: -4 }} />
          ) : null}
        </View>

        <Text
          variant={focused ? 'captionStrong' : 'caption'}
          numberOfLines={1}
          style={{ color: labelColor, fontSize: 12, lineHeight: 16 }}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
