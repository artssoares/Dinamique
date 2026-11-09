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
  /**
   * `preview` plays and loops. `export` waits to be told to record. `bake`
   * makes the file the moment it is up, with nobody watching: see
   * `bakery/store.ts`.
   */
  mode?: 'preview' | 'export' | 'bake';
  /**
   * How the 9:16 canvas sits in a box of another shape. `contain` letterboxes
   * (the full screen); `cover` fills and crops the sides (the square tile on
   * the day screen, where the middle of the frame is what matters).
   */
  fit?: 'contain' | 'cover';
  /**
   * Whether the document itself takes the finger. Off wherever something
   * above it is the control: an iframe swallows every tap that lands on it,
   * so a Pressable wrapped around one never hears the press.
   */
  interactive?: boolean;
  style?: object;
}
