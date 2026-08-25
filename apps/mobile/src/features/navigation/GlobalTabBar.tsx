import { useCallback } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { layout } from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';
import { useNotificationCounts } from '@/hooks/useNotifications';
import { TabBarSurface } from './TabBar';

/**
 * The menu, on the screens the tab navigator does not reach.
 *
 * Inside `(tabs)` the bar belongs to the navigator and carries its own state.
 * Everywhere else (a goal, a refuelling, a day of the history, the whole of
 * Mais) there was simply no menu, and the driver's only way anywhere was the
 * back arrow. On a phone that is merely tiring; in the browser, where the app
 * actually ships, it reads as the navigation disappearing.
 *
 * Two decisions worth keeping:
 *
 *  - it renders *outside* the navigator, over the stack, rather than by moving
 *    those routes into the tab group. Moving them would rewrite every path in
 *    the app and change how back behaves on a dozen screens, which is a large
 *    blast radius for a bar;
 *  - nothing here is focused. None of these screens is a tab, so lighting one
 *    up would claim the driver is somewhere they are not. Tapping any of them
 *    goes to that tab, which is exactly what a menu is for.
 */

/** Space the bar occupies, for `Screen` to hold at the bottom of the page. */
export const GLOBAL_TAB_BAR_SPACE = layout.tabBarHeight + layout.tabBarInset;

/** Route groups that own the whole screen and must not carry a menu. */
const WITHOUT_MENU = ['(auth)', 'onboarding', '(tabs)'];

/**
 * Whether the floating menu belongs on the route currently showing.
 *
 * Exported so the root layout can reserve the space with the same answer that
 * decides whether to draw the bar: two different answers would be a bar over
 * the last card, or a gap under a screen with no bar.
 */
export function useGlobalTabBarVisible(): boolean {
  const { session, profile, loading } = useSession();
  const segments = useSegments();
  const group = segments[0];

  // Nothing until the session settles, or the bar flashes over the sign-in
  // screen on every cold start.
  if (loading || !session) return false;
  // Onboarding is a task with one way through it. So is signing in.
  if (profile !== null && profile.onboardingCompletedAt === null) return false;
  // `undefined` is the root itself, which redirects immediately.
  if (group === undefined) return false;

  return !WITHOUT_MENU.includes(group);
}

export function GlobalTabBar() {
  const router = useRouter();
  const visible = useGlobalTabBarVisible();
  const { unreadTotal } = useNotificationCounts();

  const select = useCallback(
    (name: string) => {
      // `navigate` rather than `push`: the tab group is already in the stack
      // underneath this screen, so pushing would stack a second copy of the
      // whole app on top of it and turn back into a maze.
      router.navigate(name === 'index' ? '/(tabs)' : (`/(tabs)/${name}` as never));
    },
    [router],
  );

  if (!visible) return null;

  // `anchorTour={false}`: the navigator's bar owns the tour anchors, and both
  // bars are mounted at once while a pushed screen is showing.
  return (
    <TabBarSurface
      activeName={null}
      onSelect={select}
      badge={unreadTotal}
      anchorTour={false}
    />
  );
}
