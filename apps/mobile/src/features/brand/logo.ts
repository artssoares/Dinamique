import type { ImageSourcePropType } from 'react-native';

/**
 * O logotipo oficial da Dinamique, extraído do mini manual de marca V1.0.
 *
 * Duas versões, porque o manual pede as duas (§05 do manual):
 *   - `logo.png` — wordmark azul com ponto coral, para fundos claros
 *   - `logo-negativo.png` — wordmark branco com ponto coral, para o azul da
 *     marca, cabeçalhos e superfícies escuras
 *
 * O logotipo nunca é redesenhado, re-tipografado nem reproporcionado. O ponto
 * final coral faz parte da assinatura e não se remove.
 */
export const LOGO_SOURCE: ImageSourcePropType =
  require('../../../../../assets/brand/logo.png');

export const LOGO_NEGATIVE_SOURCE: ImageSourcePropType =
  require('../../../../../assets/brand/logo-negativo.png');

/** Largura ÷ altura do arquivo real (1168 × 213). A marca nunca é esticada. */
export const LOGO_ASPECT_RATIO = 1168 / 213;
