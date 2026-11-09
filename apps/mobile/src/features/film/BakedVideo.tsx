import { forwardRef, useEffect, useImperativeHandle } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { darkTokens } from '@dinamique/ui';

export interface BakedVideoHandle {
  /** Seconds into the film. */
  time: () => number;
  seek: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  /** Pauses a playing film, resumes a paused one. Returns whether it now plays. */
  toggle: () => boolean;
}

/**
 * The finished film, played as a video.
 *
 * This is what makes the film smooth. Before, what the driver watched was
 * the map, the route and the figures being painted again for every frame,
 * live, on the phone's main thread: a busy moment, a tile arriving, a scroll,
 * and a frame was late. A video is decoded by the phone's own hardware, the
 * same way every other video in every other app is, and it does not stutter.
 * It is also the very file that gets shared, so what was watched is exactly
 * what goes out.
 *
 * Always muted and mixed with whatever else is playing: the film has no
 * sound, and a driver's music or navigation voice must not stop for it.
 */
export const BakedVideo = forwardRef<
  BakedVideoHandle,
  {
    uri: string;
    /** `contain` letterboxes (full screen); `cover` fills and crops (the square). */
    fit?: 'contain' | 'cover';
    /** Where to pick up, so a film growing to full screen continues rather than restarts. */
    startAt?: number;
    playing?: boolean;
    style?: StyleProp<ViewStyle>;
  }
>(function BakedVideo({ uri, fit = 'contain', startAt = 0, playing = true, style }, ref) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.audioMixingMode = 'mixWithOthers';
    if (startAt > 0) instance.currentTime = startAt;
    if (playing) instance.play();
  });

  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [player, playing]);

  useImperativeHandle(
    ref,
    () => ({
      time: () => player.currentTime,
      seek: (seconds: number) => {
        player.currentTime = seconds;
      },
      play: () => player.play(),
      pause: () => player.pause(),
      toggle: () => {
        if (player.playing) {
          player.pause();
          return false;
        }
        player.play();
        return true;
      },
    }),
    [player],
  );

  return (
    <VideoView
      player={player}
      contentFit={fit}
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
      playsInline
      // A texture rather than a surface on Android: the square grows into the
      // full screen with a fade and a scale, and a SurfaceView ignores both.
      surfaceType="textureView"
      style={[{ flex: 1, backgroundColor: darkTokens.backgroundPrimary }, style]}
    />
  );
});
