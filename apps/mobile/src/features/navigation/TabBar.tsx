import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CountBadge, Icon, Text, layout, useResponsive, useTheme, type IconName } from '@dinamique/ui';
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

export interface TabBarProps extends BottomTabBarProps {
  /** Unread count shown on "Mais". */
  badge?: number;
}

/**
 * The floating tab bar.
 *
 * It replaces the default bar — a full-width strip with a hairline border and
 * unicode glyphs for icons. This one is a single rounded surface that floats
 * clear of the bottom edge, and only the active destination carries its label,
 * which is what lets five destinations fit without crowding.
 *
 * The active pill animates its width so the change reads as one control moving
 * rather than five controls redrawing.
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
  // Anchors the coach mark that says "use o + para lançar ganhos e gastos".
  const tourTarget = useTourTarget(`tab-${tab.name}`);
  const expansion = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(expansion, {
      toValue: focused ? 1 : 0,
      duration: theme.motion.fast,
      easing: Easing.out(Easing.cubic),
      // Width and colour are not native-driver properties.
      useNativeDriver: false,
    }).start();
  }, [expansion, focused, theme.motion.fast]);

  const diameter = 48;

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

  const showLabel = focused && !tab.centre && !compact;

  return (
    <Pressable
      ref={tourTarget.ref}
      collapsable={false}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      onPress={onPress}
      style={{ flexGrow: focused && !tab.centre ? 1 : 0, alignItems: 'center' }}
    >
      <Animated.View
        style={{
          minWidth: diameter,
          height: diameter,
          paddingHorizontal: showLabel ? theme.spacing.lg : 0,
          borderRadius: theme.radius.pill,
          backgroundColor: background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: showLabel ? theme.spacing.sm : 0,
        }}
      >
        <Icon name={tab.icon} size={tab.centre ? 24 : 21} color={iconColor} />
        {/* The centre action keeps its fill in every state, so "you are here"
            has to be said with a ring instead of a colour change. */}
        {tab.centre && focused ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -3,
              left: -3,
              right: -3,
              bottom: -3,
              borderRadius: theme.radius.pill,
              borderWidth: 2,
              borderColor: theme.colors.navSurfaceActive,
            }}
          />
        ) : null}
        {showLabel ? (
          <Text variant="captionStrong" style={{ color: iconColor }} numberOfLines={1}>
            {tab.label}
          </Text>
        ) : null}
        {badge > 0 ? (
          <CountBadge count={badge} style={{ position: 'absolute', top: 2, right: 2 }} />
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
