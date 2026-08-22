import { Image, View } from 'react-native';
import { relativeLuminance, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';

export interface PlatformMarkProps {
  slug: string;
  name: string;
  logoPath?: string | null;
  /**
   * `platforms.brand_color`, a six digit hex string from the catalogue.
   *
   * It is catalogue data, not a constant here: the tile exists so a driver
   * finds iFood by its red instead of reading twelve labels, and when a
   * platform rebrands an admin changes the row rather than waiting for a
   * release. A platform with no colour gets a neutral tile, which is honest
   * rather than a guess.
   *
   * The tile is a monogram, never a reproduction of anyone's mark: we do not
   * have the right to ship Uber's or iFood's logos in this repository. If a
   * real logo is uploaded through the admin, `logoPath` wins.
   */
  brandColor?: string | null;
  size?: number;
}

export function PlatformMark({ slug, name, logoPath, brandColor, size = 40 }: PlatformMarkProps) {
  const theme = useTheme();

  if (logoPath) {
    const { data } = supabase.storage.from('platforms').getPublicUrl(logoPath);
    return (
      <Image
        source={{ uri: data.publicUrl }}
        accessibilityLabel={name}
        resizeMode="contain"
        style={{ width: size, height: size, borderRadius: theme.radius.md }}
      />
    );
  }

  const background = brandColor ?? theme.colors.backgroundSecondary;
  // The ink is chosen from the tile's own luminance rather than stored beside
  // it, so a yellow tile gets dark type and a black one gets white without a
  // second column to keep in step.
  const luminance = relativeLuminance(background);
  const ink =
    luminance === null
      ? theme.colors.textPrimary
      : luminance > 0.45
        ? theme.colors.textInverse
        : theme.colors.textOnBrand;

  const initials = name
    .replace(/[^A-Za-z0-9À-ÿ ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      accessibilityElementsHidden
      testID={`platform-mark-${slug}`}
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.md,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.borderSubtle,
      }}
    >
      <Text variant="captionStrong" style={{ color: ink, fontSize: size * 0.36 }}>
        {initials || '·'}
      </Text>
    </View>
  );
}
