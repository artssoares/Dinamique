import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CountBadge, Card, Text, useTheme } from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';
import { useNotificationCounts } from '@/hooks/useNotifications';

/**
 * "Mais" holds everything that must be reachable without competing with the
 * daily loop: support, referrals, the influencer programme, settings (§96).
 */
export default function More() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, plan, isTrial, signOut } = useSession();
  const { unreadSupport } = useNotificationCounts();

  const sections: { title: string; items: { label: string; href: string; badge?: number }[] }[] = [
    {
      title: 'CONTA',
      items: [
        { label: 'Meu perfil', href: '/profile' },
        { label: 'Meu veículo', href: '/vehicle' },
        { label: 'Metas', href: '/goals' },
        { label: 'Plano e assinatura', href: '/plan' },
      ],
    },
    {
      title: 'AJUDA E PROGRAMAS',
      items: [
        { label: 'Suporte', href: '/support', badge: unreadSupport },
        { label: 'Indique um motorista', href: '/referrals' },
        { label: 'Seja um Influencer', href: '/influencer' },
      ],
    },
    {
      title: 'PREFERÊNCIAS',
      items: [
        { label: 'Notificações', href: '/notifications' },
        { label: 'Aparência', href: '/settings/appearance' },
        { label: 'Exportar meus dados', href: '/export' },
      ],
    },
  ];

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.backgroundPrimary }}
      contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}
    >
      <View style={{ gap: theme.spacing.xxs }}>
        <Text variant="titleLg">{profile?.preferredName ?? profile?.firstName ?? 'Você'}</Text>
        <Text variant="caption" color="secondary">
          {plan === 'pro' ? (isTrial ? 'Pro — período de teste' : 'Pro') : 'Plano Free'}
        </Text>
      </View>

      {sections.map((section) => (
        <View key={section.title} style={{ gap: theme.spacing.sm }}>
          <Text variant="captionStrong" color="secondary">
            {section.title}
          </Text>
          <Card padding="none" style={{ overflow: 'hidden' }}>
            {section.items.map((item, index) => (
              <Pressable
                key={item.href}
                accessibilityRole="link"
                onPress={() => router.push(item.href as never)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: theme.spacing.lg,
                  paddingHorizontal: theme.spacing.xl,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: theme.colors.borderSubtle,
                  backgroundColor: pressed ? theme.colors.surfaceHover : 'transparent',
                })}
              >
                <Text variant="body">{item.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  {item.badge ? <CountBadge count={item.badge} /> : null}
                  <Text variant="body" color="muted">
                    ›
                  </Text>
                </View>
              </Pressable>
            ))}
          </Card>
        </View>
      ))}

      <Pressable
        accessibilityRole="button"
        onPress={signOut}
        style={{ paddingVertical: theme.spacing.lg, alignItems: 'center' }}
      >
        <Text variant="bodyStrong" color="danger">
          Sair da conta
        </Text>
      </Pressable>
    </ScrollView>
  );
}
