import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatCents, formatDistanceKm, formatDuration } from '@dinamique/utils';
import {
  Button,
  Card,
  EmptyState,
  HeroCard,
  IconButton,
  ListRow,
  Money,
  ProgressRing,
  Screen,
  SectionHeader,
  Skeleton,
  StatTile,
  Text,
  useResponsive,
  useTheme,
  type IconName,
} from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';
import { useToday } from '@/hooks/useToday';
import { useActiveJourney } from '@/features/journey/useJourney';
import { AppHeader } from '@/features/shell/AppHeader';
import { useTourTarget } from '@/features/tour/TourProvider';

/**
 * Home. The target is comprehension in about five seconds (§24): who you are,
 * how the goal is going, and what to do next. Everything else is secondary.
 *
 * The screen is built around one shape — the hero card, and the goal ring
 * inside it — so it is recognisable before a single figure is read.
 */
export default function Today() {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useSession();
  const { data, loading, refresh } = useToday();
  const { journey } = useActiveJourney();
  const { isCompact } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);

  const goalTarget = useTourTarget('goal');
  const statsTarget = useTourTarget('today-stats');
  const startTarget = useTourTarget('start-journey');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const name = profile?.preferredName ?? profile?.firstName ?? '';
  const headline = data?.goalBasis === 'net' ? data.netProfit : (data?.grossRevenue ?? 0);

  return (
    <Screen
      header={<AppHeader greeting={greeting()} title={name ? `Olá, ${name}!` : 'Olá!'} subtitle="Vamos ver como está o seu dia." />}
      tabBarSpacing
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      grow
    >
      {loading ? (
        <HomeSkeleton />
      ) : (
        <>
          <View ref={goalTarget.ref} collapsable={false}>
            <HeroCard
              label={data?.goalBasis === 'net' ? 'Lucro de hoje' : 'Faturamento de hoje'}
              tag="Hoje"
              tagIcon="wallet"
              meta={todayLabel()}
              details={[
                { label: 'Tempo', value: data && data.workedSeconds > 0 ? formatDuration(data.workedSeconds) : '—' },
                { label: 'Distância', value: data && data.distance > 0 ? formatDistanceKm(data.distance) : '—' },
                { label: 'Despesas', value: formatCents(data?.totalExpenses ?? 0) },
              ]}
            >
              <Money value={headline} variant="moneyHero" animate style={{ color: theme.colors.textOnBrand }} />
            </HeroCard>
          </View>

          <QuickActions
            journeyActive={journey !== null}
            onStart={() => router.push('/(tabs)/record')}
            startRef={startTarget.ref}
          />

          {data?.goal ? (
            <Card padding="xl" style={{ alignItems: 'center', gap: theme.spacing.lg }}>
              <View style={{ alignSelf: 'stretch' }}>
                <SectionHeader
                  title="Meta de hoje"
                  actionLabel="Ajustar"
                  onAction={() => router.push('/goals')}
                />
              </View>
              <ProgressRing
                ratio={data.goal.ratio}
                label={`Meta de hoje, ${Math.round(data.goal.ratio * 100)}%`}
                centreLabel={`${Math.round(data.goal.ratio * 100)}%`}
                centreHint={
                  data.goal.isReached
                    ? 'Meta batida'
                    : `Faltam ${formatCents(data.goal.remaining)}`
                }
                size={isCompact ? 148 : 176}
              />
              <Text variant="caption" color="secondary" align="center">
                {formatCents(data.goal.achieved)} de {formatCents(data.goal.target)}
                {data.secondsToGoal !== null && data.secondsToGoal > 0
                  ? ` · no ritmo de hoje, faltam cerca de ${formatDuration(data.secondsToGoal)}`
                  : ''}
              </Text>
            </Card>
          ) : (
            <Card padding="xl" style={{ gap: theme.spacing.md }}>
              <Text variant="subtitle">Você ainda não tem uma meta</Text>
              <Text variant="body" color="secondary">
                Diga quanto quer ganhar por mês e o Dinamique divide isso em uma meta por dia.
              </Text>
              <Button
                label="Definir minha meta"
                variant="secondary"
                iconName="target"
                onPress={() => router.push('/goals')}
              />
            </Card>
          )}

          <View ref={statsTarget.ref} collapsable={false} style={{ gap: theme.spacing.md }}>
            <SectionHeader
              title="Seus números de hoje"
              actionLabel="Ver histórico"
              onAction={() => router.push('/(tabs)/history')}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
              <StatTile
                label="Lucro"
                icon="wallet"
                tone={data && data.netProfit < 0 ? 'danger' : 'success'}
                value={formatCents(data?.netProfit ?? 0)}
              />
              <StatTile
                label="R$ por hora"
                icon="clock"
                value={data?.profitPerHour === null || data?.profitPerHour === undefined ? null : formatCents(data.profitPerHour)}
                emptyHint="sem tempo registrado"
              />
              <StatTile
                label="R$ por km"
                icon="route"
                value={data?.revenuePerKm === null || data?.revenuePerKm === undefined ? null : formatCents(data.revenuePerKm)}
                emptyHint="sem km"
              />
              <StatTile
                label="Despesas"
                icon="receipt"
                tone="danger"
                value={formatCents(data?.totalExpenses ?? 0)}
              />
            </View>
          </View>

          {!data?.hasAnyData ? (
            <Card padding="none" style={{ overflow: 'hidden' }}>
              <EmptyState
                iconName="sparkle"
                title="Nada registrado hoje ainda"
                description="Comece uma jornada ou lance um ganho — em poucos toques o Dinamique já mostra quanto sobrou."
                actionLabel="Registrar agora"
                onAction={() => router.push('/(tabs)/record')}
              />
            </Card>
          ) : (
            <View style={{ gap: theme.spacing.md }}>
              <SectionHeader title="Atalhos" />
              <Card padding="none" style={{ overflow: 'hidden' }}>
                <ListRow
                  first
                  icon="fuel"
                  iconTone="warning"
                  label="Abastecimento"
                  description="Registre litros, preço e o consumo sai sozinho"
                  onPress={() => router.push('/fuel')}
                />
                <ListRow
                  icon="wrench"
                  iconTone="brand"
                  label="Manutenção"
                  description="O que já foi feito e o que está chegando"
                  onPress={() => router.push('/costs/maintenance')}
                />
                <ListRow
                  icon="receipt"
                  iconTone="danger"
                  label="Custos fixos"
                  description="Aluguel do carro, seguro, parcelas"
                  onPress={() => router.push('/costs/recurring')}
                />
              </Card>
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

/**
 * The four round actions under the hero. Round rather than rectangular so they
 * read as a toolbar and not as four more cards — and because a circle is the
 * easiest shape to hit without looking at the screen.
 */
function QuickActions({
  journeyActive,
  onStart,
  startRef,
}: {
  journeyActive: boolean;
  onStart: () => void;
  startRef: (node: View | null) => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  const actions: { icon: IconName; label: string; onPress: () => void; primary?: boolean }[] = [
    {
      icon: journeyActive ? 'stop' : 'play',
      label: journeyActive ? 'Encerrar' : 'Iniciar',
      onPress: journeyActive ? () => router.push('/journey/close') : onStart,
      primary: true,
    },
    { icon: 'arrowUpRight', label: 'Ganho', onPress: () => router.push('/(tabs)/record') },
    { icon: 'fuel', label: 'Abastecer', onPress: () => router.push('/fuel') },
    { icon: 'insights', label: 'Insights', onPress: () => router.push('/(tabs)/insights') },
  ];

  return (
    <Card padding="lg">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {actions.map((action) => (
          <View
            key={action.label}
            ref={action.primary ? startRef : undefined}
            collapsable={false}
            style={{ alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}
          >
            <IconButton
              icon={action.icon}
              label={action.label}
              tone={action.primary ? 'brand' : 'surface'}
              size={52}
              onPress={action.onPress}
              style={
                action.primary
                  ? undefined
                  : {
                      backgroundColor: theme.colors.backgroundSecondary,
                      borderWidth: 0,
                    }
              }
            />
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {action.label}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function todayLabel(): string {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function HomeSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Skeleton height={200} radius={theme.radius['3xl']} />
      <Skeleton height={96} radius={theme.radius['2xl']} />
      <Skeleton height={240} radius={theme.radius['2xl']} />
    </View>
  );
}
