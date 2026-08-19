import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export interface GradientProps {
  colors: [string, string];
  /** 'diagonal' reads as light falling across a card; 'vertical' as depth. */
  direction?: 'diagonal' | 'vertical' | 'horizontal';
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

/**
 * A two-stop gradient fill, drawn with react-native-svg rather than a native
 * gradient module. The app already ships SVG for icons, so this adds no
 * dependency and behaves identically on iOS, Android and web.
 *
 * The Svg layer is absolutely positioned behind the children, so the component
 * lays out exactly like the `View` it replaces.
 */
export function Gradient({
  colors,
  direction = 'diagonal',
  radius = 0,
  style,
  children,
}: GradientProps) {
  const [x2, y2] =
    direction === 'vertical' ? ['0', '1'] : direction === 'horizontal' ? ['1', '0'] : ['1', '1'];

  // On the web every <Svg> shares one document, so a fixed gradient id makes
  // the second card on a screen paint with the first card's colours. The id
  // has to be unique per instance.
  const fillId = `gradient-${useId().replace(/:/g, '')}`;

  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        pointerEvents="none"
        accessibilityElementsHidden
      >
        <Defs>
          <LinearGradient id={fillId} x1="0" y1="0" x2={x2} y2={y2}>
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${fillId})`} />
      </Svg>
      {children}
    </View>
  );
}
