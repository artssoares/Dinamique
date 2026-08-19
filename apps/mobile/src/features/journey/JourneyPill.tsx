import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDuration } from '@dinamique/utils';
import { Icon, Text, useReducedMotion, useTheme } from '@dinamique/ui';
import { useActiveJourney } from './useJourney';

/**
 * The "a journey is running" strip.
 *
 * It sits above everything on Home and says one thing: the clock is going.
 * Deliberately quiet, a tinted pill rather than a banner, because it is true
 * for hours at a time and a loud element that never goes away stops being
 * read. The dot breathes so a glance catches it without the text being loud.
 */
export function JourneyPill() {
  const theme = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { journey } = useActiveJourney();
  const [now, setNow] = useState(() => Date.now());
  const pulse = useRef(new Animated.Value(0)).current;

  const running = journey?.status === 'active';

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running || reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced, running]);

  if (!journey) return null;

  const elapsed = Math.max(
    0,
    Math.round((now - Date.parse(journey.startedAt)) / 1000) - journey.pausedSeconds,
  );
  const paused = journey.status === 'paused';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        paused ? 'Jornada pausada, tocar para abrir' : `Jornada em andamento há ${formatDuration(elapsed)}`
      }
      onPress={() => router.push('/(tabs)/record')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radius.pill,
        backgroundColor: paused ? theme.colors.warningSubtle : theme.colors.successSubtle,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Animated.View
        style={{
          width: 9,
          height: 9,
          borderRadius: theme.radius.pill,
          backgroundColor: paused ? theme.colors.warning : theme.colors.success,
          opacity: paused ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
          transform: [
            { scale: paused ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
          ],
        }}
      />
      <Text variant="captionStrong" color={paused ? 'warning' : 'success'}>
        {paused ? 'Jornada pausada' : 'Jornada em andamento'}
      </Text>
      <View style={{ flex: 1 }} />
      <Text variant="captionStrong" color={paused ? 'warning' : 'success'}>
        {formatDuration(elapsed)}
      </Text>
      <Icon
        name="chevronRight"
        size={15}
        color={paused ? theme.colors.warningText : theme.colors.successText}
      />
    </Pressable>
  );
}
