import type { Metres, Millilitres, Seconds } from '@dinamique/types';
import { parseDecimal } from './decimal';

export const KM = 1000;
export const LITRE = 1000;
export const HOUR_SECONDS = 3600;

export function metresToKm(m: Metres): number {
  return m / KM;
}

export function kmToMetres(km: number): Metres {
  return Math.round(km * KM);
}

export function millilitresToLitres(ml: Millilitres): number {
  return ml / LITRE;
}

export function litresToMillilitres(l: number): Millilitres {
  return Math.round(l * LITRE);
}

export function secondsToHours(s: Seconds): number {
  return s / HOUR_SECONDS;
}

/** "7h 25min", "45min", "0min" — compact enough for a metric tile. */
export function formatDuration(totalSeconds: Seconds): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / HOUR_SECONDS);
  const minutes = Math.floor((safe % HOUR_SECONDS) / 60);
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

export function formatDistanceKm(m: Metres, fractionDigits = 0): string {
  return `${metresToKm(m).toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })} km`;
}

/** Consumption is stored as metres per litre; drivers read it as km/l. */
export function formatConsumption(metresPerLitre: number): string {
  return `${(metresPerLitre / KM).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km/l`;
}

export function formatPercent(ratio: number, fractionDigits = 0): string {
  return `${(ratio * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
}

/**
 * Reads a distance a driver typed in kilometres, and stores it in metres.
 *
 * Goes through `parseDecimal` because the pt-BR keyboard gives a comma: bare
 * `Number('34,2')` is NaN, so a driver correcting the suggested figure with
 * the separator their own phone offered would have watched their kilometres
 * vanish. Returns null for anything that is not a positive distance — a zero
 * or a negative is not a shorter day, it is a typo.
 */
export function parseKmToMetres(input: string): Metres | null {
  const km = parseDecimal(input);
  if (km === null || km <= 0) return null;
  // Rounding can land on zero, which the database's `> 0` check rejects — and
  // a close that fails on the distance would cost the driver the whole day.
  const metres = kmToMetres(km);
  return metres > 0 ? metres : null;
}
