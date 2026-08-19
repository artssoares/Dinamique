import { Image } from 'react-native';
import { useTheme } from '@dinamique/ui';
import { LOGO_ASPECT_RATIO, LOGO_NEGATIVE_SOURCE, LOGO_SOURCE } from './logo';

const HEIGHTS = { sm: 20, md: 28, lg: 40, xl: 56 } as const;

export interface BrandMarkProps {
  size?: keyof typeof HEIGHTS;
  /**
   * `auto` segue o tema: azul no claro, branco no escuro. Use `negative`
   * quando a marca estiver sobre o azul da própria marca — aí o wordmark é
   * branco mesmo no tema claro, como manda o manual.
   */
  tone?: 'auto' | 'negative';
}

/**
 * Assinatura da marca (§02 e §05 do manual).
 *
 * O manual define duas versões e quando usar cada uma: wordmark azul sobre
 * fundos claros, wordmark branco sobre o azul da marca e superfícies escuras.
 * Escolher pelo tema em vez de deixar cada tela decidir é o que impede a marca
 * azul de acabar sobre um fundo escuro, onde ela some.
 *
 * A proporção vem do arquivo — a marca nunca é esticada nem reproporcionada.
 */
export function BrandMark({ size = 'md', tone = 'auto' }: BrandMarkProps) {
  const theme = useTheme();
  const height = HEIGHTS[size];

  const negative = tone === 'negative' || theme.scheme === 'dark';

  return (
    <Image
      source={negative ? LOGO_NEGATIVE_SOURCE : LOGO_SOURCE}
      accessibilityLabel="dinamique."
      style={{ height, width: height * LOGO_ASPECT_RATIO }}
      resizeMode="contain"
    />
  );
}
