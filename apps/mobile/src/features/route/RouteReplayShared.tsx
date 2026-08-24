import { useMemo, type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import type { LatLng, Metres } from '@dinamique/types';
import { haversineMetres } from '@dinamique/business-logic';
import { formatDistanceKm } from '@dinamique/utils';
import { Icon, IconButton, Text, useTheme } from '@dinamique/ui';
import { useRouteAnimation } from './useRouteAnimation';

export const REPLAY_HEIGHT = 260;

export interface RouteReplayProps {
  points: readonly LatLng[];
  /**
   * The distance as it was filed, which is what the rest of the app shows.
   *
   * Not recomputed from the drawn points: those have been simplified, so the
   * sum of their segments is a little shorter than the day. A replay that
   * disagreed with the history about the same shift would be worse than a
   * replay with no number on it at all.
   */
  distance: Metres | null;
  height?: number;
  /** Starts drawing as soon as it appears; off for a card the driver scrolls past. */
  autoPlay?: boolean;
  /**
   * What tapping the drawing does.
   *
   * The map itself does not pan, zoom or rotate — see the two replays — so the
   * whole picture is dead space to a finger. Handing that space to sharing is
   * what makes the trajectory something a driver can do something with,
   * instead of something they look at.
   */
  onPress?: () => void;
  /** What that tap does, for a screen reader. */
  pressLabel?: string;
}

interface SharedProps extends RouteReplayProps {
  /** The map or the drawn line — whichever this platform has. */
  renderTrack: (progress: Animated.Value, index: number) => ReactNode;
  /** "Powered by Esri", when and only when a real basemap is underneath. */
  attribution?: string | null;
}

/**
 * Everything around the route that is the same on every platform: the control,
 * the kilometres climbing, the attribution.
 *
 * Split out so the map replay and the drawn replay cannot drift apart in the
 * parts that are not the map. The two files that use it differ by exactly the
 * thing they are supposed to differ by.
 */
export function RouteReplayShared({
  points,
  distance,
  height = REPLAY_HEIGHT,
  autoPlay = true,
  onPress,
  pressLabel,
  renderTrack,
  attribution,
}: SharedProps) {
  const theme = useTheme();
  const { progress, index, playing, finished, toggle } = useRouteAnimation(points.length, autoPlay);

  /**
   * How far along the drawn line each point sits, 0..1.
   *
   * Computed once per route and by distance rather than by point count,
   * because simplification leaves points dense in the bends and sparse on the
   * straights — counting them would make the readout race through a motorway
   * and crawl round a roundabout.
   */
  const shares = useMemo(() => {
    if (points.length < 2) return [0];
    const cumulative: number[] = [0];
    let total = 0;
    for (let i = 1; i < points.length; i += 1) {
      total += haversineMetres(points[i - 1]!, points[i]!);
      cumulative.push(total);
    }
    if (total <= 0) return cumulative.map(() => 0);
    return cumulative.map((value) => value / total);
  }, [points]);

  const covered =
    distance === null ? null : Math.round(distance * (shares[index] ?? (finished ? 1 : 0)));

  return (
    <View style={{ gap: theme.spacing.sm }}>
      {onPress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pressLabel ?? 'Compartilhar meu trajeto'}
          onPress={onPress}
          style={({ pressed }) => ({
            height,
            justifyContent: 'center',
            opacity: pressed ? 0.9 : 1,
          })}
        >
          {renderTrack(progress, index)}

          {/*
            The whole picture is the press target, and that was the problem:
            nothing on it said so. A map is a picture until something tells you
            otherwise, and drivers were tapping it, getting a sheet, and not
            connecting the two — or worse, never tapping at all. So the control
            is drawn. Pinned rather than laid out, because the track underneath
            is a map canvas whose size we do not control, and `pointerEvents`
            none so the badge never eats the tap it is advertising.
          */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: theme.spacing.md,
              bottom: theme.spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xs,
              paddingVertical: theme.spacing.xs,
              paddingHorizontal: theme.spacing.sm,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surfacePrimary,
              ...theme.elevation.md,
            }}
          >
            <Icon name="expand" size={15} color={theme.colors.textPrimary} />
            <Text variant="captionStrong">Compartilhar</Text>
          </View>
        </Pressable>
      ) : (
        <View style={{ height, justifyContent: 'center' }}>{renderTrack(progress, index)}</View>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        }}
      >
        {/* Nothing to play on a standstill: one point is a place, not a
            journey, and a play button that visibly does nothing is worse than
            no play button. */}
        {points.length > 1 ? (
          <IconButton
            icon={finished ? 'play' : playing ? 'pause' : 'play'}
            label={finished ? 'Ver de novo' : playing ? 'Pausar o trajeto' : 'Ver o trajeto'}
            tone="surface"
            onPress={toggle}
          />
        ) : null}

        <View style={{ flex: 1 }}>
          {covered !== null ? (
            <Text variant="moneyMedium">{formatDistanceKm(covered, 1)}</Text>
          ) : (
            <Text variant="bodyStrong" color="secondary">
              Seu trajeto de hoje
            </Text>
          )}
          {attribution ? (
            // Never conditional on a setting and never behind a tap: the Esri
            // terms require it wherever their basemap is drawn.
            <Text variant="caption" color="muted">
              {attribution}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
