import { createContext, useContext, type ReactNode } from 'react';

/**
 * How much room the app is holding at the bottom of every screen.
 *
 * `Screen` already knows about the floating tab bar inside the tab group, via
 * its own `tabBarSpacing` flag. This exists for the bar that floats over
 * *pushed* screens, which `Screen` cannot see: it is rendered by the app above
 * the navigator, on top of whatever route is showing, and a screen that did
 * not account for it would put its last card and its primary button underneath
 * it.
 *
 * A context rather than a prop because the alternative is passing the same
 * number through every screen in the app and getting it wrong on the next one
 * somebody writes. A number rather than a component because the design system
 * has no business knowing what the app decided to float there.
 *
 * Zero is the default, so a `Screen` outside the provider behaves exactly as
 * it did before this existed.
 */
const BottomInsetContext = createContext(0);

export function BottomInsetProvider({
  value,
  children,
}: {
  value: number;
  children: ReactNode;
}) {
  return <BottomInsetContext.Provider value={value}>{children}</BottomInsetContext.Provider>;
}

export function useBottomInset(): number {
  return useContext(BottomInsetContext);
}
