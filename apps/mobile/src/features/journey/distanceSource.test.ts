import { describe, expect, it } from 'vitest';
import { journeyDistance } from '@dinamique/business-logic';
import { resolveDistanceSource, type DistanceInputs } from './distanceSource';

const base: DistanceInputs = {
  distanceOverride: null,
  odometerStart: null,
  odometerEnd: null,
  gpsDistance: null,
  suggested: null,
  typed: '',
};

/** Runs the real rule over the same inputs, so the two cannot drift apart. */
function ruleUsed(inputs: DistanceInputs) {
  const distance = journeyDistance({
    id: 'j',
    startedAt: '2026-08-21T08:00:00.000Z',
    endedAt: '2026-08-21T16:00:00.000Z',
    pausedSeconds: 0,
    odometerStart: inputs.odometerStart,
    odometerEnd: inputs.odometerEnd,
    distanceOverride: inputs.distanceOverride,
    distanceGps: inputs.gpsDistance,
  });
  if (distance === null) return null;
  if (inputs.distanceOverride !== null && inputs.distanceOverride > 0) return 'override';
  if (distance === inputs.gpsDistance) return 'gps';
  return 'odometer';
}

describe('resolveDistanceSource', () => {
  it('calls an untouched suggestion what it is', () => {
    expect(
      resolveDistanceSource({
        ...base,
        distanceOverride: 34_200,
        gpsDistance: 34_200,
        suggested: '34,2',
        typed: '34,2',
      }),
    ).toBe('gps');
  });

  it('calls a corrected suggestion manual', () => {
    expect(
      resolveDistanceSource({
        ...base,
        distanceOverride: 41_000,
        gpsDistance: 34_200,
        suggested: '34,2',
        typed: '41',
      }),
    ).toBe('manual');
  });

  it('calls a number typed with nothing suggested manual', () => {
    expect(resolveDistanceSource({ ...base, distanceOverride: 41_000, typed: '41' })).toBe('manual');
  });

  it('names an odometer pair', () => {
    expect(resolveDistanceSource({ ...base, odometerStart: 100_000, odometerEnd: 152_000 })).toBe(
      'odometer',
    );
  });

  it('does not call a lone closing reading an odometer measurement', () => {
    // journeyDistance() skips straight past it to the GPS figure. Saying
    // "odometer" here would make the column contradict the rule.
    const inputs = { ...base, odometerEnd: 152_000, gpsDistance: 34_200 };
    expect(resolveDistanceSource(inputs)).toBe('gps');
    expect(ruleUsed(inputs)).toBe('gps');
  });

  it('does not call a backwards odometer pair an odometer measurement', () => {
    const inputs = { ...base, odometerStart: 180_000, odometerEnd: 100_000, gpsDistance: 34_200 };
    expect(resolveDistanceSource(inputs)).toBe('gps');
    expect(ruleUsed(inputs)).toBe('gps');
  });

  it('calls an accepted suggestion manual when the GPS figure was withheld', () => {
    // Consent withdrawn between the suggestion and the save: the field still
    // holds our number, but nothing GPS-derived reached the row.
    expect(
      resolveDistanceSource({
        ...base,
        distanceOverride: 34_200,
        gpsDistance: null,
        suggested: '34,2',
        typed: '34,2',
      }),
    ).toBe('manual');
  });

  it('names nothing when nothing was measured', () => {
    expect(resolveDistanceSource(base)).toBeNull();
    expect(ruleUsed(base)).toBeNull();
  });

  it('agrees with journeyDistance about which input was used', () => {
    const cases: DistanceInputs[] = [
      { ...base, gpsDistance: 34_200 },
      { ...base, odometerStart: 1_000, odometerEnd: 5_000, gpsDistance: 34_200 },
      { ...base, odometerStart: 1_000, gpsDistance: 34_200 },
      { ...base, odometerStart: 5_000, odometerEnd: 5_000, gpsDistance: 34_200 },
      { ...base, gpsDistance: 0 },
    ];

    for (const inputs of cases) {
      const mine = resolveDistanceSource(inputs);
      const rule = ruleUsed(inputs);
      expect(mine, JSON.stringify(inputs)).toBe(rule === 'override' ? 'manual' : rule);
    }
  });
});
