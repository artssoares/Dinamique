import { Image, View } from 'react-native';
import { Text, useTheme } from '@dinamique/ui';
import { LOGO_ASPECT_RATIO, LOGO_SOURCE } from './logo.js';

const HEIGHTS = { sm: 20, md: 28, lg: 40 } as const;

export interface BrandMarkProps {
  size?: keyof typeof HEIGHTS;
}

/**
 * Renders the supplied logo at its own proportions. When the asset is missing
 * it shows a placeholder that says so — it never substitutes type for the mark.
 */
export function BrandMark({ size = 'md' }: BrandMarkProps) {
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

  return (
    <View
      accessibilityLabel="Logo Dinamique pendente"
      style={{
        height,
        width: height * LOGO_ASPECT_RATIO,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: theme.colors.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="overline" color="muted">
        logo.png
      </Text>
    </View>
  );
}
