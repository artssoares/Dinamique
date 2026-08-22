import type { DistanceSource, Metres } from '@dinamique/types';

export interface DistanceInputs {
  distanceOverride: Metres | null;
  odometerStart: Metres | null;
  odometerEnd: Metres | null;
  gpsDistance: Metres | null;
  /** The km figure we suggested, as it was rendered into the field. */
  suggested: string | null;
  /** What the field actually holds now. */
  typed: string;
}

/**
 * Which measurement the driver ended up with.
 *
 * Recorded for reporting, never consulted: the resolution order lives in
 * `journeyDistance()` and in the `daily_totals` view. That makes this the one
 * place where a mistake is invisible in the product and poisonous in the
 * warehouse, which is why it is here with tests rather than inline in a screen.
 *
 * The branches must mirror `journeyDistance()` exactly. In particular a lone
 * closing odometer reading is *not* a distance — the rule skips straight past
 * it to the GPS figure, and saying "odometer" here would have the column
 * contradict the rule it exists to describe.
 */
export function resolveDistanceSource(inputs: DistanceInputs): DistanceSource | null {
  const hasGps = inputs.gpsDistance !== null && inputs.gpsDistance > 0;

  if (inputs.distanceOverride !== null && inputs.distanceOverride > 0) {
    // The field holding exactly what we put there means the driver accepted
    // our measurement; anything else means they used their own.
    //
    // `hasGps` guards it because consent can be withdrawn between the
    // suggestion and the save: the field still holds our number, but nothing
    // GPS-derived was stored, and calling that 'gps' would have the column
    // describe a measurement the row does not contain.
    return hasGps && inputs.suggested !== null && inputs.typed.trim() === inputs.suggested
      ? 'gps'
      : 'manual';
  }

  const { odometerStart: start, odometerEnd: end } = inputs;
  if (start !== null && end !== null && end > start) return 'odometer';

  return hasGps ? 'gps' : null;
}
