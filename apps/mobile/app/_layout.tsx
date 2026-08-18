import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@dinamique/ui';
import { SessionProvider, useSession } from '@/hooks/useSession';
import { OfflineProvider } from '@/features/offline/useOfflineSync';
import { OfflineBanner } from '@/features/offline/OfflineBanner';
import { Tour } from '@/features/tour/Tour';

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
      <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.backgroundPrimary },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="support" options={{ presentation: 'card' }} />
      </Stack>
    </>
  );
}

function ThemedApp() {
  const { profile } = useSession();
  return (
    <ThemeProvider initialPreference={profile?.theme ?? 'system'}>
      <StatusBarBridge />
      <RootNavigator />
      <Tour />
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
