import { describe, expect, it } from 'vitest';
import { storyFigures } from './storyFigures';

const day = {
  distance: 84_000,
  workedSeconds: 26_700,
  revenuePerKm: 210,
};

describe('storyFigures', () => {
  it('leads with kilometres, time and R$/km', () => {
    const figures = storyFigures(day);
    expect(figures.map((f) => f.label)).toEqual(['km rodados', 'tempo', 'por km']);
  });

  it('never puts what the driver earned on the card', () => {
    // There is no switch for this any more, and that is the point: a story
    // saying how much cash somebody finished the night with, from an account
    // that shows the city they drive in, is not something to make the driver
    // remember to decline.
    const labels = storyFigures(day).map((f) => f.label);
    expect(labels).not.toContain('faturamento');
    expect(labels.length).toBe(3);
  });

  it('carries a missing distance through as null, never as zero', () => {
    const figures = storyFigures({ ...day, distance: null, revenuePerKm: null });
    expect(figures[0]!.value).toBeNull();
    expect(figures[2]!.value).toBeNull();
    expect(figures[0]!.emptyHint).toBe('sem km informado');
  });

  it('formats the figures in pt-BR', () => {
    const figures = storyFigures(day);
    expect(figures[0]!.value).toBe('84,0 km');
    expect(figures[1]!.value).toBe('7h 25min');
    expect(figures[2]!.value).toContain('2,10');
  });
});
