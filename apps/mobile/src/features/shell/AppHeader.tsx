import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, IconButton, Text, useResponsive, useTheme } from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';
import { useNotificationCounts } from '@/hooks/useNotifications';
import { avatarUrl } from '@/features/profile/avatar';
import { useTourTarget } from '@/features/tour/TourProvider';

export interface AppHeaderProps {
  /** Greeting line. Omit on screens that carry their own title. */
  greeting?: string;
  title?: string;
  subtitle?: string;
}

/**
 * The header on every tab screen.
 *
 * Layout is fixed and deliberate: a menu control on the left, the bell and the
 * user's own face on the right. The photo is the largest, right-most element
 * because "that is me, and this is my account" is the one thing a header has
 * to communicate without a label.
 */
export function AppHeader({ greeting, title, subtitle }: AppHeaderProps) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const { unreadTotal } = useNotificationCounts();
  const { isCompact, isMedium, contentWidth, scale } = useResponsive();

  const bellTarget = useTourTarget('bell');
  const profileTarget = useTourTarget('profile');
  const menuTarget = useTourTarget('menu');

  const name = profile?.preferredName ?? profile?.firstName ?? '';

  return (
    <View
      style={{
        paddingTop: insets.top + theme.spacing.sm,
        paddingHorizontal: isCompact ? theme.spacing.lg : theme.spacing.xl,
        paddingBottom: theme.spacing.md,
        backgroundColor: theme.colors.backgroundPrimary,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: isMedium ? contentWidth : undefined,
          alignSelf: 'center',
          gap: theme.spacing.lg,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View ref={menuTarget.ref} collapsable={false}>
            <IconButton
              icon="menu"
              label="Abrir o menu"
              tone="surface"
              onPress={() => router.push('/(tabs)/more')}
            />
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <View ref={bellTarget.ref} collapsable={false}>
              <IconButton
                icon="bell"
                label={unreadTotal > 0 ? `Notificações, ${unreadTotal} não lidas` : 'Notificações'}
                tone="surface"
                badge={unreadTotal}
                onPress={() => router.push('/notifications')}
              />
            </View>

            <Pressable
              ref={profileTarget.ref}
              collapsable={false}
              accessibilityRole="button"
              accessibilityLabel="Meu perfil"
              onPress={() => router.push('/profile')}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            >
              <Avatar
                url={avatarUrl(profile?.avatarPath ?? null)}
                name={name || 'Você'}
                size={44}
                style={{ borderWidth: 2, borderColor: theme.colors.surfacePrimary }}
              />
            </Pressable>
          </View>
        </View>

        {greeting || title || subtitle ? (
          <View style={{ gap: theme.spacing.xxs }}>
            {greeting ? (
              <Text variant="caption" color="secondary">
                {greeting}
              </Text>
            ) : null}
            {title ? (
              <Text
                variant="titleLg"
                style={{ fontSize: scale(28, { min: 24, max: 34 }), lineHeight: scale(34, { min: 30, max: 40 }) }}
                numberOfLines={1}
              >
                {title}
              </Text>
            ) : null}
            {subtitle ? (
              <Text variant="body" color="secondary">
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
