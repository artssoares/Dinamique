import { Image } from 'react-native';
import { LOGO_ASPECT_RATIO, LOGO_NEGATIVE_SOURCE, LOGO_SOURCE } from './logo';

const HEIGHTS = { sm: 20, md: 28, lg: 40 } as const;

export interface BrandMarkProps {
  size?: keyof typeof HEIGHTS;
  /** Renders the negative (white wordmark) version, for a dark or brand-coloured surface. */
  onDark?: boolean;
}

/** The Dinamique mark, at its own proportions. It is never stretched. */
export function BrandMark({ size = 'md', onDark = false }: BrandMarkProps) {
  const height = HEIGHTS[size];

  return (
    <Image
      source={onDark ? LOGO_NEGATIVE_SOURCE : LOGO_SOURCE}
      accessibilityLabel="Dinamique"
      style={{ height, width: height * LOGO_ASPECT_RATIO }}
      resizeMode="contain"
    />
  );
}
