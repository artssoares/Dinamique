import type { Recap, RecapMessage } from '@dinamique/recap';

/** What a screen can ask of the stage, on either platform. */
export interface FilmStageHandle {
  play: () => void;
  pause: () => void;
  seek: (index: number) => void;
  /** Starts the recording. The result arrives through `onMessage`. */
  record: () => void;
}

export interface FilmStageProps {
  recap: Recap;
  onMessage?: (message: RecapMessage) => void;
  /** A recording document does not loop and does not start on its own. */
  mode?: 'preview' | 'export';
  style?: object;
}
