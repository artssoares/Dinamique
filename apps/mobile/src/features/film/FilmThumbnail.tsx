import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import type { Recap, RecapMessage } from '@dinamique/recap';
import { darkTokens, Icon, usePressMotion, useTheme } from '@dinamique/ui';
import { FilmStage, type FilmStageHandle } from './FilmStage';

/**
 * The film as a small square, already playing.
 *
 * The square is a window onto the middle of the 9:16 frame, where the head of
 * the route moves; the sides are cropped rather than letterboxed, because a
 * thumbnail with black bars reads as a broken image. Tapping it grows the
 * film to full screen, and the badge in the corner is what says so.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface FilmThumbnailHandle {
  play: () => void;
  pause: () => void;
  seek: (index: number) => void;
}

export interface FilmThumbnailProps {
  recap: Recap;
  size: number;
  /** Frame to pick up from, when the full screen hands the film back. */
  startIndex?: number;
  onFrame?: (index: number) => void;
  onPress: () => void;
}

export const FilmThumbnail = forwardRef<FilmThumbnailHandle, FilmThumbnailProps>(function FilmThumbnail(
  { recap, size, startIndex, onFrame, onPress },
  ref,
) {
  const theme = useTheme();
  const stageRef = useRef<FilmStageHandle>(null);
  const press = usePressMotion({ scale: 0.96, opacity: 0.94 });

  useImperativeHandle(
    ref,
    () => ({
      play: () => stageRef.current?.play(),
      pause: () => stageRef.current?.pause(),
      seek: (index: number) => stageRef.current?.seek(index),
    }),
    [],
  );

  const handleMessage = useCallback(
    (message: RecapMessage) => {
      if (message.type === 'ready' && startIndex !== undefined && startIndex > 0) {
        stageRef.current?.seek(startIndex);
        return;
      }
      if (message.type === 'frame') onFrame?.(message.index);
    },
    // `startIndex` is read once, at 'ready'; a later change must not reseek a
    // film the driver is watching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFrame],
  );

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel="Ver o filme em tela cheia"
      onPress={onPress}
      {...press.handlers}
      style={[
        {
          width: size,
          height: size,
          borderRadius: theme.radius.xl,
          overflow: 'hidden',
          backgroundColor: darkTokens.backgroundPrimary,
        },
        press.style,
      ]}
    >
      <FilmStage ref={stageRef} recap={recap} mode="preview" fit="cover" onMessage={handleMessage} />

      {/* Pinned rather than laid out, because the stage underneath is a
          canvas whose size we do not control, and `pointerEvents` none so
          the badge never eats the tap it advertises. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: theme.spacing.xs,
          bottom: theme.spacing.xs,
          width: 28,
          height: 28,
          borderRadius: theme.radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: darkTokens.surfacePrimary,
        }}
      >
        <Icon name="expand" size={14} color={darkTokens.textPrimary} />
      </View>
    </AnimatedPressable>
  );
});
