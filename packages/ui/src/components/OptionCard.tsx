import type { ReactNode } from 'react';
import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { usePressMotion } from '../hooks/usePressMotion';
import { Icon, type IconName } from '../icons/Icon';
import { MIN_TOUCH_TARGET } from '../tokens/index';
import { Text } from './Text';

export interface OptionCardProps {
  label: string;
  description?: string;
  icon?: IconName;
  /** Replaces the icon puck entirely, e.g. a platform's brand tile. */
  leading?: ReactNode;
  selected: boolean;
  onPress: () => void;
  /** Checkbox semantics for multi-select, radio for single. */
  multiple?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A large, tappable answer.
 *
 * Onboarding used small chips, which is a lot of precision to ask of someone
 * answering questions one-handed in a parked car. A card is roughly six times
 * the target area and has room to say what the option actually means.
 *
 * Selection is carried by a border, a tint AND a check mark – never colour
 * alone (§116).
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function OptionCard({
  label,
  description,
  icon,
  leading,
  selected,
  onPress,
  multiple = false,
  style,
}: OptionCardProps) {
  const theme = useTheme();
  const press = usePressMotion({ scale: 0.98, opacity: 0.9 });

  return (
    <AnimatedPressable
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      onPress={onPress}
      {...press.handlers}
      style={[
        {
          minHeight: MIN_TOUCH_TARGET + 20,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.xl,
          backgroundColor: selected ? theme.colors.brandPrimarySubtle : theme.colors.surfacePrimary,
          borderWidth: 1.5,
          borderColor: selected ? theme.colors.brandPrimary : theme.colors.borderSubtle,
        },
        press.style,
        style,
      ]}
    >
      {leading ??
        (icon ? (
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: theme.radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected
                ? theme.colors.brandPrimary
                : theme.colors.backgroundSecondary,
            }}
          >
            <Icon
              name={icon}
              size={20}
              color={selected ? theme.colors.textOnBrand : theme.colors.textSecondary}
            />
          </View>
        ) : null)}

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="caption" color="secondary">
            {description}
          </Text>
        ) : null}
      </View>

      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: multiple ? theme.radius.sm : theme.radius.pill,
          borderWidth: 2,
          borderColor: selected ? theme.colors.brandPrimary : theme.colors.borderStrong,
          backgroundColor: selected ? theme.colors.brandPrimary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? <Icon name="check" size={14} color={theme.colors.textOnBrand} /> : null}
      </View>
    </AnimatedPressable>
  );
}
