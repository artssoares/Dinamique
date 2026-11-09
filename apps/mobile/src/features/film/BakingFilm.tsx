import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import type { LatLng } from '@dinamique/types';
import { ProgressRing, Text, ThemeScope, useReducedMotion, useTheme } from '@dinamique/ui';
import { RouteReplayTrace } from '@/features/route/RouteReplayTrace';

/**
 * What stands in for the film while its file is being made.
 *
 * The day's route, drawn as far as the file has got. The wait has something
 * to look at, and it is the driver's own day taking shape, not a spinner.
 * Without a route there is nothing to draw, and a ring says how far along
 * the file is instead.
 *
 * Dark whatever the app's theme, like the film it stands in for.
 */
export function BakingFilm({
  points,
  progress,
  height,
  radius,
  caption,
}: {
  points: readonly LatLng[];
  /** 0 to 1. */
  progress: number;
  height: number;
  radius?: number;
  /** A line under the drawing; omitted where the box is too small for one. */
  caption?: string;
}) {
  return (
    <ThemeScope scheme="dark">
      <BakingFilmBody
        points={points}
        progress={progress}
        height={height}
        radius={radius}
        caption={caption}
      />
    </ThemeScope>
  );
}

function BakingFilmBody({
  points,
  progress,
  height,
  radius,
  caption,
}: {
  points: readonly LatLng[];
  progress: number;
  height: number;
  radius?: number;
  caption?: string;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const drawn = useRef(new Animated.Value(progress)).current;

  // Progress arrives in steps, a few times a second. Easing between them is
  // what makes the line grow rather than jump.
  useEffect(() => {
    if (reduced) {
      drawn.setValue(progress);
      return;
    }
    const animation = Animated.timing(drawn, {
      toValue: progress,
      duration: 320,
      // A path's dash offset is not a native-driver property.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [drawn, progress, reduced]);

  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  if (points.length < 2) {
    return (
      <View
        style={{
          height,
          borderRadius: radius ?? theme.radius['2xl'],
          backgroundColor: theme.colors.backgroundSecondary,
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.md,
        }}
      >
        <ProgressRing
          ratio={progress}
          size={Math.min(160, Math.round(height * 0.6))}
          thickness={height < 160 ? 6 : 10}
          centreLabel={height < 160 ? undefined : `${percent}%`}
          label={`Montando o vídeo, ${percent}%`}
        />
        {caption ? (
          <Text variant="caption" color="secondary" align="center">
            {caption}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <RouteReplayTrace points={points} progress={drawn} height={height} radius={radius} />
      {caption ? (
        <Text variant="caption" color="secondary" align="center">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
