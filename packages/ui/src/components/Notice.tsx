import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Icon, type IconName } from '../icons/Icon';
import { IconButton } from './IconButton';
import { Text } from './Text';

export type NoticeTone = 'danger' | 'warning' | 'success' | 'info';

export interface NoticeProps {
  message: string;
  title?: string;
  tone?: NoticeTone;
  /** Small technical line under the message, for reading out to support. */
  detail?: string;
  /** Adds a close control. Without it the notice stays until state changes. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * The band that says what just went wrong, in place, next to the control that
 * failed.
 *
 * It exists because writes used to fail in silence: a rejected insert and a
 * successful one looked exactly alike, which is how "eu clico e nada acontece"
 * happens. An alert would interrupt; this stays on the screen the person is
 * already looking at.
 */
export function Notice({ message, title, tone = 'danger', detail, onDismiss, style }: NoticeProps) {
  const theme = useTheme();

  const tones: Record<
    NoticeTone,
    { background: string; icon: string; glyph: IconName; text: Parameters<typeof Text>[0]['color'] }
  > = {
    danger: {
      background: theme.colors.dangerSubtle,
      icon: theme.colors.dangerText,
      glyph: 'alert',
      text: 'danger',
    },
    warning: {
      background: theme.colors.warningSubtle,
      icon: theme.colors.warningText,
      glyph: 'alert',
      text: 'warning',
    },
    success: {
      background: theme.colors.successSubtle,
      icon: theme.colors.successText,
      glyph: 'check',
      text: 'success',
    },
    info: {
      background: theme.colors.brandPrimarySubtle,
      icon: theme.colors.brandPrimary,
      glyph: 'info',
      text: 'brand',
    },
  };

  const palette = tones[tone];

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel={title ? `${title}. ${message}` : message}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderRadius: theme.radius.xl,
          backgroundColor: palette.background,
        },
        style,
      ]}
    >
      <Icon name={palette.glyph} size={18} color={palette.icon} />

      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        {title ? (
          <Text variant="bodyStrong" color={palette.text}>
            {title}
          </Text>
        ) : null}
        <Text variant="caption" color={palette.text}>
          {message}
        </Text>
        {detail ? (
          <Text variant="caption" color="muted" numberOfLines={3}>
            {detail}
          </Text>
        ) : null}
      </View>

      {onDismiss ? (
        <IconButton icon="close" label="Fechar aviso" tone="ghost" size={28} onPress={onDismiss} />
      ) : null}
    </View>
  );
}
