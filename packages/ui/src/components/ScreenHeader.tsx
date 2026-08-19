import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useResponsive } from '../hooks/useResponsive';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface ScreenHeaderProps {
  title?: string;
  subtitle?: string;
  /**
   * Back handler. Passing one renders the back control — every screen that is
   * pushed onto a stack must pass it. A screen the user can only leave by
   * gesture is a screen some users cannot leave.
   */
  onBack?: () => void;
  /** 'close' for anything presented as a sheet or modal. */
  backIcon?: 'chevronLeft' | 'close';
  backLabel?: string;
  /** Buttons on the right — usually an IconButton or two. */
  actions?: ReactNode;
  /** Replaces the title entirely (the Home header uses this). */
  children?: ReactNode;
  /** Keeps the header transparent over a coloured hero. */
  transparent?: boolean;
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The header used by every pushed screen.
 *
 * The app previously set `headerShown: false` on the root stack and then passed
 * `<Stack.Screen options={{ title }} />` from each screen, so the titles were
 * set on a header that never rendered — which is why there was no way back
 * from Metas, Perfil, Plano, Custos and the rest except a swipe. This component
 * makes the back control part of the screen itself, so it cannot go missing.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backIcon = 'chevronLeft',
  backLabel = 'Voltar',
  actions,
  children,
  transparent = false,
  bordered = false,
  style,
}: ScreenHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isCompact, isMedium, contentWidth } = useResponsive();

  return (
    <View
      style={[
        {
          paddingTop: insets.top + theme.spacing.sm,
          paddingBottom: theme.spacing.md,
          paddingHorizontal: isCompact ? theme.spacing.lg : theme.spacing.xl,
          backgroundColor: transparent ? 'transparent' : theme.colors.backgroundPrimary,
          borderBottomWidth: bordered ? 1 : 0,
          borderBottomColor: theme.colors.borderSubtle,
        },
        style,
      ]}
    >
      <View
        style={{
          width: '100%',
          maxWidth: isMedium ? contentWidth : undefined,
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          minHeight: 48,
        }}
      >
        {onBack ? (
          <IconButton icon={backIcon} label={backLabel} onPress={onBack} tone="surface" />
        ) : null}

        {children ?? (
          <View style={{ flex: 1, gap: 2 }}>
            {title ? (
              <Text variant="title" numberOfLines={1}>
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}

        {actions ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            {actions}
          </View>
        ) : null}
      </View>
    </View>
  );
}
