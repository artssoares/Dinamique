import { useMemo, type ReactNode } from 'react';
import { Animated, View } from 'react-native';
import type { LatLng, Metres } from '@dinamique/types';
import { haversineMetres } from '@dinamique/business-logic';
import { formatDistanceKm } from '@dinamique/utils';
import { IconButton, Text, useTheme } from '@dinamique/ui';
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
      <View style={{ height, justifyContent: 'center' }}>{renderTrack(progress, index)}</View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        }}
      >
        <IconButton
          icon={finished ? 'play' : playing ? 'pause' : 'play'}
          label={finished ? 'Ver de novo' : playing ? 'Pausar o trajeto' : 'Ver o trajeto'}
          tone="surface"
          onPress={toggle}
        />

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
