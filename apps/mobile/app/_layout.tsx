import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@dinamique/ui';
import { isSupabaseConfigured } from '@/lib/supabase';
import { SetupScreen } from '@/features/setup/SetupScreen';
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
      <RootNavigator />
      <Tour />
    </ThemeProvider>
  );
}

/** Keeps the OS status bar legible against whichever theme is active. */
function StatusBarBridge() {
  const theme = useTheme();

  // Na web, o fundo de `+html.tsx` é só o palpite do sistema operacional. Quem
  // escolheu "claro" num aparelho escuro (ou o contrário) veria esse palpite
  // reaparecer na barra de rolagem e ao arrastar a página além do fim. Aqui o
  // tema que o aplicativo realmente resolveu passa para a página inteira.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const { style } = document.documentElement;
    style.backgroundColor = theme.colors.backgroundPrimary;
    style.colorScheme = theme.scheme;
    document.body.style.backgroundColor = theme.colors.backgroundPrimary;
  }, [theme.colors.backgroundPrimary, theme.scheme]);

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
