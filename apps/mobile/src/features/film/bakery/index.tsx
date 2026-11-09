import { createElement, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { Platform, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import type { Recap } from '@dinamique/recap';
import { Button } from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { FilmStage } from '../FilmStage';
import { filmIo } from './io';
import { bakeKey, createBakery, type BakeState, type BakedFilm } from './store';

export type { BakeState, BakedFilm } from './store';

/** One queue for the whole app: see `store.ts` for why only one film at a time. */
const bakery = createBakery<Recap>(filmIo);

const NONE: BakeState = {
  status: 'checking',
  progress: 0,
  baked: null,
  error: null,
  errorCode: null,
};

export interface BakedFilmHandle extends BakeState {
  key: string | null;
  /** The driver is looking at this one: make it next. */
  prioritise: () => void;
  retry: () => void;
}

/**
 * The finished file for a journey's film, made in the background the first
 * time anyone asks and found in the cache every time after.
 *
 * `urgent` puts it at the front of the queue: the full screen asks that way,
 * the cards on the day screen do not.
 */
export function useBakedFilm(
  journeyId: string | null,
  recap: Recap | null,
  options: { urgent?: boolean } = {},
): BakedFilmHandle {
  // The page the file is made from carries everything the film shows, so its
  // fingerprint changes whenever the film would, and an old file is never
  // shown for a day that has since changed.
  const key = useMemo(
    () => (journeyId && recap ? bakeKey(journeyId, recap.document({ bake: true })) : null),
    [journeyId, recap],
  );

  const getSnapshot = useCallback(() => (key ? bakery.state(key) : NONE), [key]);
  const state = useSyncExternalStore(bakery.subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (key && recap) bakery.request(key, recap, { urgent: options.urgent });
  }, [key, recap, options.urgent]);

  return {
    ...state,
    key,
    prioritise: useCallback(() => {
      if (key) bakery.prioritise(key);
    }, [key]),
    retry: useCallback(() => {
      if (key) bakery.retry(key);
    }, [key]),
  };
}

/**
 * The page that makes the active film, mounted once at the root of the app.
 *
 * Kept on screen and laid out, at four points square and almost invisible,
 * rather than unmounted or hidden: a page that is not attached, or is
 * explicitly hidden, gets its timers throttled by the platform, and the file
 * would take a minute instead of seconds. What it paints never matters here;
 * the frames go to the encoder, not to the screen.
 */
export function FilmBakeHost() {
  const job = useSyncExternalStore(bakery.subscribe, bakery.active, bakery.active);
  if (!job) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: 4,
        height: 4,
        opacity: 0.02,
        overflow: 'hidden',
      }}
    >
      <FilmStage
        key={job.key}
        recap={job.recap}
        mode="bake"
        interactive={false}
        onMessage={(message) => bakery.handleMessage(job.key, message)}
      />
    </View>
  );
}

/**
 * Opens the share sheet with the finished file.
 *
 * On a phone the sheet opens from anywhere. In a browser it opens only from
 * inside a tap, and only if nothing was awaited first, which is why
 * `ShareFilmButton` calls this from a real DOM button on the web.
 */
export function shareBakedFilm(
  baked: BakedFilm,
  journeyId: string,
): Promise<'sheet' | 'download' | 'cancelled'> {
  const done = (how: 'sheet' | 'download') => {
    void track('journey_film_shared', {
      journey_id: journeyId,
      mime: baked.mime,
      how,
      baked: true,
    });
    return how;
  };

  if (Platform.OS !== 'web') {
    return Sharing.shareAsync(baked.uri, {
      mimeType: baked.mime,
      dialogTitle: 'Compartilhar jornada',
      // Without the UTI iOS treats the file as generic, and some options
      // (Stories, for one) simply do not appear.
      UTI: 'public.movie',
    }).then(() => done('sheet'));
  }

  const download = () => {
    const link = document.createElement('a');
    link.href = baked.uri;
    link.download = baked.file?.name ?? 'dinamique-jornada.mp4';
    link.click();
    return done('download');
  };

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  const file = baked.file;
  let sheet = false;
  try {
    sheet = !!file && typeof nav.share === 'function' && !!nav.canShare?.({ files: [file] });
  } catch {
    sheet = false;
  }
  if (!sheet || !file) return Promise.resolve(download());

  return nav.share({ files: [file], title: 'Meu dia no Dinamique' }).then(
    () => done('sheet'),
    (error: unknown) => {
      // Closing the sheet without choosing is not a failure.
      if ((error as { name?: string })?.name === 'AbortError') return 'cancelled' as const;
      void track('journey_film_failed', {
        code: `share-${(error as { name?: string })?.name ?? 'Error'}`,
        journey_id: journeyId,
      });
      return download();
    },
  );
}

/**
 * The share button for a finished film.
 *
 * On the web the tap that opens the share sheet has to reach `navigator.share`
 * inside the browser's own click. A Pressable hands the press through React
 * Native Web's responder system, and iOS has been seen treating that as no
 * gesture at all. So a real DOM button sits over the styled one, invisible,
 * and takes the click first.
 */
export function ShareFilmButton({
  baked,
  journeyId,
  label,
  disabled,
  onPress,
  size = 'lg',
}: {
  /** Null while the file is still being made. */
  baked: BakedFilm | null;
  journeyId: string;
  label: string;
  disabled?: boolean;
  /** For a press before the file exists, which the caller decides how to handle. */
  onPress?: () => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const press = () => {
    if (baked) void shareBakedFilm(baked, journeyId);
    else onPress?.();
  };

  const domButton =
    Platform.OS === 'web' && baked && !disabled
      ? createElement('button', {
          type: 'button',
          'aria-label': label,
          onClick: (event: { preventDefault: () => void }) => {
            event.preventDefault();
            void shareBakedFilm(baked, journeyId);
          },
          style: {
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            border: 'none',
            padding: 0,
            margin: 0,
            background: 'transparent',
            cursor: 'pointer',
          },
        })
      : null;

  return (
    <View style={{ position: 'relative' }}>
      <Button
        label={label}
        size={size}
        fullWidth
        iconName="arrowUpRight"
        disabled={disabled}
        onPress={press}
      />
      {domButton}
    </View>
  );
}
