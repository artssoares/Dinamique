import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, type ColorSchemeName as RNColorScheme } from 'react-native';
import type { ThemePreference } from '@dinamique/types';
import {
  darkTokens,
  elevation,
  lightTokens,
  motion,
  radius,
  spacing,
  typography,
  type ColorSchemeName,
  type ThemeTokens,
} from '../tokens/index.js';

/**
 * Theme context (§16). Components read tokens from here and never import a
 * palette step directly — that is what makes light/dark a single switch.
 */
export interface Theme {
  colors: ThemeTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  elevation: typeof elevation;
  motion: typeof motion;
  scheme: ColorSchemeName;
}

interface ThemeContextValue extends Theme {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function buildTheme(scheme: ColorSchemeName): Theme {
  return {
    colors: scheme === 'dark' ? darkTokens : lightTokens,
    spacing,
    radius,
    typography,
    elevation,
    motion,
    scheme,
  };
}

function resolveScheme(preference: ThemePreference, system: RNColorScheme): ColorSchemeName {
  if (preference === 'system') return system === 'dark' ? 'dark' : 'light';
  return preference;
}

export interface ThemeProviderProps {
  children: ReactNode;
  /** Persisted preference; defaults to following the OS. */
  initialPreference?: ThemePreference;
  /** Called whenever the user changes the preference, so it can be persisted. */
  onPreferenceChange?: (preference: ThemePreference) => void;
}

export function ThemeProvider({
  children,
  initialPreference = 'system',
  onPreferenceChange,
}: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(initialPreference);
  const [systemScheme, setSystemScheme] = useState<RNColorScheme>(() =>
    Appearance.getColorScheme(),
  );

  // Following the OS means reacting to it changing while the app is open.
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setPreferenceState(initialPreference);
  }, [initialPreference]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setPreferenceState(next);
      onPreferenceChange?.(next);
    },
    [onPreferenceChange],
  );

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = resolveScheme(preference, systemScheme);
    return { ...buildTheme(scheme), preference, setPreference };
  }, [preference, systemScheme, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside a <ThemeProvider>.');
  }
  return context;
}

export function useThemePreference(): Pick<ThemeContextValue, 'preference' | 'setPreference' | 'scheme'> {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemePreference must be used inside a <ThemeProvider>.');
  }
  const { preference, setPreference, scheme } = context;
  return { preference, setPreference, scheme };
}
