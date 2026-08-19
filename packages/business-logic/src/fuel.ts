import type { Cents, Millilitres } from '@dinamique/types';
import { roundCents } from '@dinamique/utils';

/**
 * Abastecimento (§30).
 *
 * Valor total, preço por litro e litros formam um triângulo: sabendo dois, o
 * terceiro é conta. O usuário nunca deve digitar o que dá para calcular (§4).
 */

export interface FuelEntry {
  totalAmount: Cents | null;
  /** Centavos por litro. */
  pricePerLitre: Cents | null;
  volume: Millilitres | null;
}

export interface FuelCompletion extends FuelEntry {
  /** Qual campo foi preenchido pelo sistema, para a interface poder avisar. */
  derived: 'totalAmount' | 'pricePerLitre' | 'volume' | null;
}

/**
 * Completa o campo que falta. Se o usuário informou os três, respeitamos o que
 * ele digitou – corrigir número de gente por conta própria gera desconfiança.
 */
export function completeFuelEntry(entry: FuelEntry): FuelCompletion {
  const { totalAmount, pricePerLitre, volume } = entry;

  const known = [totalAmount, pricePerLitre, volume].filter(
    (value) => value !== null && value > 0,
  ).length;

  if (known !== 2) return { ...entry, derived: null };

  if (totalAmount !== null && pricePerLitre !== null && pricePerLitre > 0) {
    return {
      ...entry,
      volume: Math.round((totalAmount / pricePerLitre) * 1000),
      derived: 'volume',
    };
  }

  if (totalAmount !== null && volume !== null && volume > 0) {
    return {
      ...entry,
      pricePerLitre: roundCents(totalAmount / (volume / 1000)),
      derived: 'pricePerLitre',
    };
  }

  if (pricePerLitre !== null && volume !== null) {
    return {
      ...entry,
      totalAmount: roundCents(pricePerLitre * (volume / 1000)),
      derived: 'totalAmount',
    };
  }

  return { ...entry, derived: null };
}

/** Um abastecimento só pode ser salvo com um valor gasto de verdade. */
export function isFuelEntryComplete(entry: FuelEntry): boolean {
  return entry.totalAmount !== null && entry.totalAmount > 0;
}
