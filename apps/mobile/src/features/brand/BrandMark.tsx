import { Image, View } from 'react-native';
import { Text, useTheme } from '@dinamique/ui';
import { LOGO_ASPECT_RATIO, LOGO_SOURCE } from './logo';

const HEIGHTS = { sm: 20, md: 28, lg: 40 } as const;

export interface BrandMarkProps {
  size?: keyof typeof HEIGHTS;
  /** Renders for a dark or coloured surface. */
  onDark?: boolean;
}

/**
 * The Dinamique mark.
 *
 * When `assets/brand/logo.png` is in the repository this renders that file at
 * its own proportions, and the mark is never stretched. Until then it renders
 * a wordmark set in the app's own type: a stand-in, not the logo. Dropping the
 * real file in and pointing `logo.ts` at it swaps every appearance at once.
 */
export function BrandMark({ size = 'md', onDark = false }: BrandMarkProps) {
  const theme = useTheme();
  const height = HEIGHTS[size];

  if (LOGO_SOURCE) {
    return (
      <Image
        source={LOGO_SOURCE}
        accessibilityLabel="Dinamique"
        // Aspect ratio comes from the file; the mark is never stretched.
        style={{ height, width: height * LOGO_ASPECT_RATIO }}
        resizeMode="contain"
      />
    );
  }

  const ink = onDark ? theme.colors.textOnBrand : theme.colors.textPrimary;
  const dot = onDark ? theme.colors.textOnBrand : theme.colors.brandPrimary;

  return (
    <View
      accessibilityLabel="Dinamique"
      accessible
      style={{ flexDirection: 'row', alignItems: 'flex-end', height }}
    >
      <Text
        style={{
          fontSize: height * 0.62,
          lineHeight: height,
          fontWeight: '800',
          letterSpacing: -height * 0.03,
          color: ink,
        }}
      >
        dinamique
      </Text>
      <View
        style={{
          width: height * 0.16,
          height: height * 0.16,
          borderRadius: theme.radius.pill,
          backgroundColor: dot,
          marginLeft: height * 0.06,
          marginBottom: height * 0.16,
        }}
      />
    </View>
  );
}
