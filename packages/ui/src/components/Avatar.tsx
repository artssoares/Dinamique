import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface AvatarProps {
  /** URL pública da foto. Sem ela, mostramos as iniciais (§19). */
  url?: string | null;
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function Avatar({ url, name, size = 44, style }: AvatarProps) {
  const theme = useTheme();

  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  const base: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.brandPrimarySubtle,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    style,
  ];

  if (url) {
    return (
      <View style={base}>
        <Image
          source={{ uri: url }}
          accessibilityLabel={`Foto de ${name}`}
          style={{ width: size, height: size }}
        />
      </View>
    );
  }

  return (
    <View style={base} accessibilityLabel={`Iniciais de ${name}`}>
      <Text
        variant={size >= 72 ? 'titleLg' : size >= 44 ? 'bodyStrong' : 'caption'}
        color="brand"
      >
        {initials || '·'}
      </Text>
    </View>
  );
}
