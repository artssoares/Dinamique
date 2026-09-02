import { formatDistanceKm } from '@dinamique/utils';

/**
 * What the last screen of the close wizard says about the map.
 *
 * Its own function, and tested, because it is the answer to a question a
 * driver asks once and then trusts: is my day going to have a map or not. The
 * wizard used to close in silence and put the answer on the summary
 * afterwards, which is one screen too late to do anything about it.
 */
export type RouteVerdict =
  /** The driver never asked us to count, so nothing was captured. */
  | { kind: 'off' }
  /** Capture was on and the receiver gave us nothing usable. */
  | { kind: 'empty' }
  /** One spot. A journey opened and closed without the car moving. */
  | { kind: 'stationary' }
  /** There is a line to draw. */
  | { kind: 'drawn'; pointCount: number; distance: number | null };

export interface RouteVerdictInput {
  /** Null while the preference is still unknown; treated as capture on. */
  captureEnabled: boolean | null;
  /** Points the shift produced, after simplification. */
  pointCount: number;
  /** Metres measured, or null when the track was too thin to be believed. */
  distance: number | null;
}

/**
 * Two points is the minimum for a line. One is a place, not a route, and the
 * single most common shape in this account's history: a journey started and
 * closed at the same kerb.
 */
export function routeVerdict({
  captureEnabled,
  pointCount,
  distance,
}: RouteVerdictInput): RouteVerdict {
  if (captureEnabled === false) return { kind: 'off' };
  if (pointCount <= 0) return { kind: 'empty' };
  if (pointCount === 1) return { kind: 'stationary' };
  return { kind: 'drawn', pointCount, distance };
}

/** The heading and the sentence under it, in that order. */
export function routeVerdictCopy(verdict: RouteVerdict): { title: string; detail: string } {
  switch (verdict.kind) {
    case 'off':
      return {
        title: 'Sem mapa',
        detail:
          'A contagem por GPS está desligada, então esta jornada não vai ter trajeto. Dá para ligar em Mais, Trajeto e privacidade, e vale a partir da próxima.',
      };
    case 'empty':
      return {
        title: 'Sem mapa',
        detail:
          'O GPS não registrou nenhuma posição nesta jornada. Costuma ser sinal fraco ou o aplicativo fechado durante o trajeto.',
      };
    case 'stationary':
      return {
        title: 'Sem trajeto',
        detail:
          'O GPS registrou um ponto só: o carro não saiu do lugar. Não tem caminho para desenhar, e o resto da jornada é salvo normalmente.',
      };
    case 'drawn':
      return {
        title:
          verdict.distance !== null
            ? `Mapa de ${formatDistanceKm(verdict.distance, 1)}`
            : 'Mapa do trajeto',
        detail:
          verdict.distance !== null
            ? 'Fica salvo com a jornada. Você vê e compartilha em Histórico, tocando neste dia.'
            : 'O caminho fica salvo, mas o trecho é curto demais para virar quilometragem. Você vê o mapa em Histórico, tocando neste dia.',
      };
  }
}
