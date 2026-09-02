import { describe, expect, it } from 'vitest';
import { routeVerdict, routeVerdictCopy } from './closeReview';

describe('routeVerdict', () => {
  it('says off when the driver never asked us to count', () => {
    // Points can exist from before the preference was switched off. The
    // preference wins, because it is what `save()` obeys.
    expect(routeVerdict({ captureEnabled: false, pointCount: 400, distance: 12_000 }))
      .toEqual({ kind: 'off' });
  });

  it('treats an unknown preference as on, so the copy is not a false negative', () => {
    expect(routeVerdict({ captureEnabled: null, pointCount: 400, distance: 12_000 }).kind)
      .toBe('drawn');
  });

  it('separates nothing captured from one point captured', () => {
    expect(routeVerdict({ captureEnabled: true, pointCount: 0, distance: null }))
      .toEqual({ kind: 'empty' });
    expect(routeVerdict({ captureEnabled: true, pointCount: 1, distance: null }))
      .toEqual({ kind: 'stationary' });
  });

  it('draws from two points up', () => {
    expect(routeVerdict({ captureEnabled: true, pointCount: 2, distance: null }))
      .toEqual({ kind: 'drawn', pointCount: 2, distance: null });
  });
});

describe('routeVerdictCopy', () => {
  it('puts the measured distance in the heading when there is one', () => {
    const copy = routeVerdictCopy({ kind: 'drawn', pointCount: 300, distance: 33_000 });
    expect(copy.title).toContain('33');
  });

  it('does not claim kilometres for a route too short to be believed', () => {
    const copy = routeVerdictCopy({ kind: 'drawn', pointCount: 4, distance: null });
    expect(copy.title).toBe('Mapa do trajeto');
    expect(copy.detail).toContain('curto demais');
  });

  it('never renders a zero where a number is missing', () => {
    for (const kind of ['off', 'empty', 'stationary'] as const) {
      const copy = routeVerdictCopy({ kind });
      expect(copy.title).not.toMatch(/\d/);
      expect(copy.detail.length).toBeGreaterThan(20);
    }
  });

  it('stays free of the banned dash', () => {
    const all = [
      routeVerdictCopy({ kind: 'off' }),
      routeVerdictCopy({ kind: 'empty' }),
      routeVerdictCopy({ kind: 'stationary' }),
      routeVerdictCopy({ kind: 'drawn', pointCount: 9, distance: 5000 }),
    ];
    for (const copy of all) {
      expect(copy.title).not.toContain('—');
      expect(copy.detail).not.toContain('—');
    }
  });
});
