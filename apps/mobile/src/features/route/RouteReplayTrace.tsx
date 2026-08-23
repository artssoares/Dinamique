import { useState } from 'react';
import { Animated, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { LatLng } from '@dinamique/types';
import { traceTo, useTheme } from '@dinamique/ui';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const PADDING = 24;
const STROKE = 5;

export interface RouteReplayTraceProps {
  points: readonly LatLng[];
  /** 0→1, from `useRouteAnimation`. */
  progress: Animated.Value;
  height: number;
  radius?: number;
}

/**
 * The route as a drawn line, with no map under it.
 *
 * This is the web replay and it is also what the native replay falls back to
 * when there is no basemap key. That is on purpose: a fallback nobody ever
 * sees is a fallback nobody has ever tested, and the day a key expires is the
 * wrong day to find out.
 *
 * It is styled as a deliberate object — brand gradient, rounded caps, the
 * covered stretch bright over the whole route ghosted — rather than as a map
 * that failed to load. A driver should be able to look at this and think it is
 * the design, because it is.
 */
export function RouteReplayTrace({ points, progress, height, radius }: RouteReplayTraceProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  function onLayout(event: LayoutChangeEvent) {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }

  // Measured, not guessed: the column width differs between a phone, a tablet
  // and the web, and a hard-coded viewBox would letterbox two of the three.
  const trace = width > 0 ? traceTo(points, width, height, PADDING) : null;

  const offset = trace
    ? progress.interpolate({
        inputRange: [0, 1],
        outputRange: [trace.length, 0],
      })
    : 0;

  const start = trace?.points[0];
  // A standstill has one point and therefore no end distinct from its start.
  // Drawing both would stack a solid marker on top of the hollow one and lose
  // the "you were here" reading entirely.
  const end = points.length > 1 ? trace?.points[trace.points.length - 1] : undefined;

  return (
    <View
      onLayout={onLayout}
      style={{
        height,
        borderRadius: radius ?? theme.radius['2xl'],
        overflow: 'hidden',
        backgroundColor: theme.colors.backgroundSecondary,
      }}
    >
      {trace ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="dinamique-route" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={theme.colors.brandPrimary} />
              <Stop offset="1" stopColor={theme.colors.brandSecondary} />
            </LinearGradient>
          </Defs>

          {/* The whole day, ghosted — so the line being drawn has somewhere to
              go and the shape reads before the animation finishes. */}
          <Path
            d={trace.d}
            stroke={theme.colors.borderSubtle}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />

          <AnimatedPath
            d={trace.d}
            stroke="url(#dinamique-route)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            // The length is computed from the segments in `traceTo`, not read
            // from the node: no ref, no layout timing, and the same number on
            // every platform.
            strokeDasharray={`${trace.length} ${trace.length}`}
            strokeDashoffset={offset}
          />

          {start ? (
            <Circle
              cx={start.x}
              cy={start.y}
              r={STROKE + 1}
              fill={theme.colors.surfacePrimary}
              stroke={theme.colors.brandPrimary}
              strokeWidth={3}
            />
          ) : null}
          {end ? (
            <Circle cx={end.x} cy={end.y} r={STROKE + 1} fill={theme.colors.brandSecondary} />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
