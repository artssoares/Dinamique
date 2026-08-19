import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@dinamique/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { SetupScreen } from '@/features/setup/SetupScreen';
import { SessionProvider, useSession } from '@/hooks/useSession';
import { OfflineProvider } from '@/features/offline/useOfflineSync';
import { OfflineBanner } from '@/features/offline/OfflineBanner';
import { Tour } from '@/features/tour/Tour';
import { TourProvider } from '@/features/tour/TourProvider';
import { JourneyProvider } from '@/features/journey/useJourney';

/**
 * Routing guard. Three destinations depending on session state:
 *   no session      → (auth)
 *   onboarding open → /onboarding
 *   otherwise       → (tabs)
 */
function RootNavigator() {
  const { session, profile, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const theme = useTheme();

  useEffect(() => {
    if (loading) return;

    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === 'onboarding';

    if (!session) {
      if (!inAuth) router.replace('/(auth)/sign-in');
      return;
    }

    const needsOnboarding = profile !== null && profile.onboardingCompletedAt === null;

    if (needsOnboarding && !inOnboarding) {
      router.replace('/onboarding');
    } else if (!needsOnboarding && (inAuth || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [loading, session, profile, segments, router]);

  return (
    <>
      <OfflineBanner />
      {/* Every pushed screen draws its own <ScreenHeader>, which is what
          guarantees a visible way back – the native header is off. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.colors.backgroundPrimary },
          animation: 'slide_from_right',
          // Long enough to read as movement, short enough that nobody waits
          // for it. The default cut is what made the app feel dry.
          animationDuration: 300,
          gestureEnabled: true,
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="support" options={{ presentation: 'card' }} />
        <Stack.Screen name="assinatura" options={{ presentation: 'card' }} />
      </Stack>
    </>
  );
}

function ThemedApp() {
  const { profile } = useSession();

  // Sem configuração não há o que navegar; mostramos o que falta fazer.
  if (!isSupabaseConfigured) {
    return (
      <ThemeProvider initialPreference="system">
        <StatusBarBridge />
        <SetupScreen />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider initialPreference={profile?.theme ?? 'system'}>
      <StatusBarBridge />
      {/* The tour measures real controls, so its registry has to sit above
          every screen that can host one. */}
      {/* One journey state for the whole app: starting one on Registrar has
          to be visible on Home without a reload. */}
      <JourneyProvider>
        <TourProvider>
          <RootNavigator />
          <Tour />
        </TourProvider>
      </JourneyProvider>
    </ThemeProvider>
  );
}

/** Keeps the OS status bar legible against whichever theme is active. */
function StatusBarBridge() {
  const theme = useTheme();
  return <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SessionProvider>
          <OfflineProvider>
            <ThemedApp />
          </OfflineProvider>
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
