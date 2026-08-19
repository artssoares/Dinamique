import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../icons/Icon';
import { MIN_TOUCH_TARGET } from '../tokens/index';
import { CountBadge } from './Badge';
import { Text } from './Text';

export interface ListRowProps {
  label: string;
  description?: string;
  /** Right-hand value, e.g. an amount. */
  value?: string;
  valueTone?: 'primary' | 'success' | 'danger' | 'secondary';
  icon?: IconName;
  /** Tints the icon puck. Defaults to a neutral surface. */
  iconTone?: 'neutral' | 'brand' | 'accent' | 'success' | 'danger' | 'warning';
  badge?: number;
  onPress?: () => void;
  /** Hides the chevron on a row that opens nothing. */
  showChevron?: boolean;
  right?: ReactNode;
  first?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * One row of a list: icon puck, label, optional description, value, chevron.
 *
 * It exists because five screens each drew their own version, with different
 * paddings and a `›` character standing in for a chevron.
 */
export function ListRow({
  label,
  description,
  value,
  valueTone = 'primary',
  icon,
  iconTone = 'neutral',
  badge,
  onPress,
  showChevron,
  right,
  first = false,
  style,
}: ListRowProps) {
  const theme = useTheme();

  const tones = {
    neutral: {
      background: theme.colors.backgroundSecondary,
      icon: theme.colors.textPrimary,
      border: theme.colors.borderSubtle,
    },
    brand: {
      background: theme.colors.brandPrimarySubtle,
      icon: theme.colors.brandPrimary,
      border: 'transparent',
    },
    accent: {
      background: theme.colors.brandSecondarySubtle,
      icon: theme.colors.brandSecondary,
      border: 'transparent',
    },
    success: {
      background: theme.colors.successSubtle,
      icon: theme.colors.successText,
      border: 'transparent',
    },
    danger: {
      background: theme.colors.dangerSubtle,
      icon: theme.colors.dangerText,
      border: 'transparent',
    },
    warning: {
      background: theme.colors.warningSubtle,
      icon: theme.colors.warningText,
      border: 'transparent',
    },
  } as const;

  const puck = tones[iconTone];
  const chevron = showChevron ?? Boolean(onPress);

  const content = (
    <>
      {icon ? (
        // A squircle, not a circle: the round shapes belong to the quick
        // actions and the tab bar, and a list of forty grey circles was the
        // dullest thing on screen. The tint carries the row's meaning too,
        // so money, fuel and warnings are told apart before they are read.
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: theme.radius.lg,
            backgroundColor: puck.background,
            borderWidth: 1,
            borderColor: puck.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={20} color={puck.icon} strokeWidth={2} />
        </View>
      ) : null}

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color="secondary" numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>

      {right}

      {value ? (
        <Text variant="bodyStrong" color={valueTone}>
          {value}
        </Text>
      ) : null}

      {badge && badge > 0 ? <CountBadge count={badge} /> : null}

      {chevron ? <Icon name="chevronRight" size={18} color={theme.colors.textMuted} /> : null}
    </>
  );

  const base: StyleProp<ViewStyle> = [
    {
      minHeight: MIN_TOUCH_TARGET + 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      borderTopWidth: first ? 0 : 1,
      borderTopColor: theme.colors.borderSubtle,
    },
    style,
  ];

  if (!onPress) return <View style={base}>{content}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      onPress={onPress}
      style={({ pressed }) => [
        base,
        { backgroundColor: pressed ? theme.colors.surfaceHover : 'transparent' },
      ]}
    >
      {content}
    </Pressable>
  );
}
