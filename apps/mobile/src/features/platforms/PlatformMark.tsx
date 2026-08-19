import { Image, View } from 'react-native';
import { relativeLuminance, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';

/**
 * Brand tile colours, by platform slug.
 *
 * These are background colours for a monogram tile, not reproductions of
 * anyone's logo: we do not have the right to ship Uber's or iFood's marks in
 * this repository. A driver scanning the list still finds iFood by its red and
 * 99 by its yellow, which is the whole point of asking for logos.
 *
 * If a real logo is uploaded through the admin, `logo_path` wins and this is
 * never used for that platform.
 */
const TILE: Record<string, string> = {
  uber: '#0B0B0B',
  '99': '#FFD400',
  indrive: '#C1F11D',
  ifood: '#EA1D2C',
  rappi: '#FF441F',
  lalamove: '#F16622',
  loggi: '#00C2A8',
  amazon: '#FF9900',
  'mercado-livre': '#FFE600',
  shopee: '#EE4D2D',
  taxi: '#F5B700',
};

export interface PlatformMarkProps {
  slug: string;
  name: string;
  logoPath?: string | null;
  size?: number;
}

export function PlatformMark({ slug, name, logoPath, size = 40 }: PlatformMarkProps) {
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

  const background = TILE[slug] ?? theme.colors.backgroundSecondary;
  // The ink is chosen from the tile's own luminance rather than hardcoded, so
  // a yellow tile gets dark type and a black one gets white without a table of
  // exceptions to keep in step.
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
