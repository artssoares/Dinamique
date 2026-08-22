import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { NATIVE_DRIVER } from '../hooks/usePressMotion';
import { MIN_TOUCH_TARGET } from '../tokens/index';
import { Text } from './Text';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Describes the whole control to a screen reader. */
  label: string;
  style?: StyleProp<ViewStyle>;
}

/** Padding between the track and the thumb, on every side. */
const INSET = 4;

/**
 * Period switches (Semana / Mês / Ano) were a row of loose chips, which read as
 * four independent buttons rather than one choice. A track with a moving
 * selection says "pick exactly one of these" without a word of explanation.
 *
 * The selection is one thumb that slides, not a background that appears on the
 * new option and disappears from the old one. Two things blinking is a redraw;
 * one thing moving is a choice being made, and the eye follows it.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);

  const index = Math.max(0, options.findIndex((option) => option.value === value));
  const slot = options.length > 0 ? (trackWidth - INSET * 2) / options.length : 0;

  const position = useRef(new Animated.Value(index)).current;

  useEffect(() => {
    if (reduced) {
      position.setValue(index);
      return;
    }
    const animation = Animated.spring(position, {
      toValue: index,
      stiffness: 260,
      damping: 26,
      mass: 0.8,
      useNativeDriver: NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [index, position, reduced]);

  function onLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      onLayout={onLayout}
      style={[
        {
          flexDirection: 'row',
          padding: INSET,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.backgroundSecondary,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
        },
        style,
      ]}
    >
      {slot > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: INSET,
            bottom: INSET,
            left: INSET,
            width: slot,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.surfaceInverse,
            transform: [
              {
                translateX: position.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, slot],
                }),
              },
            ],
          }}
        />
      ) : null}

      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET - 8,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.pill,
            }}
          >
            <Text
              variant="captionStrong"
              style={{ color: selected ? theme.colors.textOnInverse : theme.colors.textSecondary }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
