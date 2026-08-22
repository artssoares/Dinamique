import type { Cents, Metres, Seconds } from '@dinamique/types';
import type { StoryFigure } from '@dinamique/ui';
import { formatCents, formatDistanceKm, formatDuration } from '@dinamique/utils';

export interface StoryInput {
  distance: Metres | null;
  workedSeconds: Seconds;
  revenuePerKm: Cents | null;
  /**
   * What the driver made, and null unless they asked for it on the card.
   *
   * Off by default, and that is a safety decision rather than a shy one. A
   * story saying how much cash somebody finished the night with, posted from
   * an account that also shows the city they work in, is a piece of
   * information a driver in Brazil has good reason not to publish. R$/km says
   * the same thing about how the day went without saying how much they are
   * carrying, so that is the figure the card leads with.
   */
  grossRevenue: Cents | null;
}

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

  if (input.grossRevenue !== null) {
    figures.push({ label: 'faturamento', value: formatCents(input.grossRevenue) });
  }

  return figures;
}
