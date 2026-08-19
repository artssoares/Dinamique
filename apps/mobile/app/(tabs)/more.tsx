import { View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Badge,
  Button,
  Card,
  ListRow,
  Screen,
  SectionHeader,
  Text,
  useTheme,
  type IconName,
} from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';
import { useNotificationCounts } from '@/hooks/useNotifications';
import { AppHeader } from '@/features/shell/AppHeader';

interface MenuItem {
  label: string;
  description?: string;
  href: string;
  icon: IconName;
  tone?: 'neutral' | 'brand' | 'accent' | 'success' | 'danger' | 'warning';
  badge?: number;
}

/**
 * "Mais" holds everything that must be reachable without competing with the
 * daily loop: support, referrals, the influencer programme, settings (§96).
 *
 * Every row carries an icon now. A column of identical text lines forces the
 * eye to read all of them; an icon lets you find "Manutenção" by shape.
 */
export default function More() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, plan, isTrial, signOut } = useSession();
  const { unreadSupport } = useNotificationCounts();

  const sections: { title: string; items: MenuItem[] }[] = [
    {
      title: 'Conta',
      items: [
        { label: 'Meu perfil', description: 'Nome, foto e cidade', href: '/profile', icon: 'user' },
        { label: 'Meu veículo', description: 'Consumo e custo por km', href: '/vehicle', icon: 'car' },
        { label: 'Metas', description: 'Quanto você quer ganhar', href: '/goals', icon: 'target' },
        {
          label: 'Plano e assinatura',
          description: plan === 'pro' ? 'Você está no Pro' : 'Você está no Free',
          href: '/plan',
          icon: 'star',
          tone: 'brand',
        },
      ],
    },
    {
      title: 'Custos e obrigações',
      items: [
        {
          label: 'Custos fixos',
          description: 'Aluguel, seguro, parcelas',
          href: '/costs/recurring',
          icon: 'receipt',
        },
        {
          label: 'Manutenção',
          description: 'Troca de óleo, pneus, revisão',
          href: '/costs/maintenance',
          icon: 'wrench',
        },
        { label: 'Multas', href: '/costs/fines', icon: 'alert', tone: 'warning' },
        {
          label: 'Free Flow',
          description: 'Pedágio sem cancela',
          href: '/costs/free-flow',
          icon: 'route',
        },
      ],
    },
    {
      title: 'Ajuda e programas',
      items: [
        {
          label: 'Suporte',
          description: 'Fale com a gente',
          href: '/support',
          icon: 'support',
          badge: unreadSupport,
        },
        { label: 'Indique um motorista', href: '/referrals', icon: 'gift', tone: 'accent' },
        { label: 'Seja um Influencer', href: '/influencer', icon: 'sparkle', tone: 'accent' },
      ],
    },
    {
      title: 'Preferências',
      items: [
        {
          label: 'Notificações',
          description: 'Seus avisos recebidos',
          href: '/notifications',
          icon: 'bell',
        },
        { label: 'Preferências de aviso', href: '/settings/notifications', icon: 'settings' },
        {
          label: 'Aparência',
          description: 'Claro, escuro ou automático',
          href: '/settings/appearance',
          icon: 'moon',
        },
        { label: 'Exportar meus dados', href: '/export', icon: 'download' },
      ],
    },
  ];

  return (
    <Screen header={<AppHeader title="Mais" />} tabBarSpacing gap="xl">
      <Card
        padding="lg"
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
      >
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="subtitle">{profile?.preferredName ?? profile?.firstName ?? 'Você'}</Text>
          <Text variant="caption" color="secondary">
            {plan === 'pro' ? (isTrial ? 'Pro — período de teste' : 'Assinante Pro') : 'Plano Free'}
          </Text>
        </View>
        <Badge label={plan === 'pro' ? 'Pro' : 'Free'} tone={plan === 'pro' ? 'brand' : 'neutral'} />
      </Card>

      {sections.map((section) => (
        <View key={section.title} style={{ gap: theme.spacing.md }}>
          <SectionHeader title={section.title} />
          <Card padding="none" style={{ overflow: 'hidden' }}>
            {section.items.map((item, index) => (
              <ListRow
                key={item.href}
                first={index === 0}
                icon={item.icon}
                iconTone={item.tone ?? 'neutral'}
                label={item.label}
                description={item.description}
                badge={item.badge}
                onPress={() => router.push(item.href as never)}
              />
            ))}
          </Card>
        </View>
      ))}

      <Button label="Sair da conta" variant="ghost" iconName="logout" fullWidth onPress={signOut} />
    </Screen>
  );
}
