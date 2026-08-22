import { describe, expect, it } from 'vitest';
import { storyFigures } from './storyFigures';

const day = {
  distance: 84_000,
  workedSeconds: 26_700,
  revenuePerKm: 210,
  grossRevenue: null,
};

describe('storyFigures', () => {
  it('leads with kilometres, time and R$/km', () => {
    const figures = storyFigures(day);
    expect(figures.map((f) => f.label)).toEqual(['km rodados', 'tempo', 'por km']);
  });

  it('leaves earnings off the card unless they were asked for', () => {
    expect(storyFigures(day).some((f) => f.label === 'faturamento')).toBe(false);
    expect(
      storyFigures({ ...day, grossRevenue: 32_000 }).some((f) => f.label === 'faturamento'),
    ).toBe(true);
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
