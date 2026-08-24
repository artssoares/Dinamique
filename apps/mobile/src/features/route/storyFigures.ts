import type { Cents, Metres, Seconds } from '@dinamique/types';
import type { StoryFigure } from '@dinamique/ui';
import { formatCents, formatDistanceKm, formatDuration } from '@dinamique/utils';

export interface StoryInput {
  distance: Metres | null;
  workedSeconds: Seconds;
  revenuePerKm: Cents | null;
}

/**
 * What the driver made is deliberately not here, and there is no switch for it.
 *
 * A story saying how much cash somebody finished the night with, posted from
 * an account that also shows the city they work in, is a piece of information
 * a driver in Brazil has good reason never to publish. It was an opt-in toggle
 * before, defaulted off, which still made it the driver's job to notice the
 * risk and decline it — on the one screen where the cost of getting it wrong
 * lands on them and not on us.
 *
 * R$/km says how the day went without saying what is in the car.
 */

/**
 * The three or four numbers on the shared card.
 *
 * Formatting happens here and nowhere else, so the card component stays a
 * layout and this stays testable without rendering anything.
 *
 * Null values survive as null all the way to the card, which draws an em dash
 * and says why. A day without kilometres did not earn R$ 0,00 per kilometre
 * (§6), and a shared image is the last place to start inventing zeroes.
 */
export function storyFigures(input: StoryInput): StoryFigure[] {
  const figures: StoryFigure[] = [
    {
      label: 'km rodados',
      value: input.distance !== null ? formatDistanceKm(input.distance, 1) : null,
      emptyHint: 'sem km informado',
    },
    {
      label: 'tempo',
      value: input.workedSeconds > 0 ? formatDuration(input.workedSeconds) : null,
      emptyHint: 'sem tempo',
    },
    {
      label: 'por km',
      value: input.revenuePerKm !== null ? formatCents(input.revenuePerKm) : null,
      emptyHint: 'sem km informado',
    },
  ];

  return figures;
}
