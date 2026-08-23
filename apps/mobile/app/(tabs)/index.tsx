import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatCents, formatDistanceKm, formatDuration } from '@dinamique/utils';
import {
  Button,
  Card,
  EmptyState,
  HeroDeck,
  IconButton,
  ListRow,
  Money,
  Notice,
  ProgressRing,
  Reveal,
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
import { useJourneyStart } from '@/features/tracking/useJourneyStart';
import { JourneyPill } from '@/features/journey/JourneyPill';
import { AppHeader } from '@/features/shell/AppHeader';
import { NotificationsSheet } from '@/features/notifications/NotificationsSheet';
import { useTourTarget } from '@/features/tour/TourProvider';

/**
 * Home. The target is comprehension in about five seconds (§24): who you are,
 * how the goal is going, and what to do next. Everything else is secondary.
 *
 * The screen is built around one shape, the hero card stack, so it is
 * recognisable before a single figure is read. Sections arrive staggered
 * rather than all at once, which is what makes it feel like a screen rather
 * than a printout.
 */
export default function Today() {
  const theme = useTheme();
  const router = useRouter();
  const { profile } = useSession();
  const { data, loading, refresh } = useToday();
  const { journey, busy: journeyBusy, error: journeyError, dismissError } = useActiveJourney();
  // `recover: false` — Registrar owns the running journey and its live figure.
  // Two screens re-registering a dropped task would race each other over the
  // same buffer; Home only needs to be able to start one properly.
  const { begin: beginJourney, sheets: consentSheets } = useJourneyStart({ recover: false });
  const { isCompact } = useResponsive();
  const [refreshing, setRefreshing] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);

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
  const goal = data?.goal ?? null;

  return (
    <>
      <Screen
        header={
          <AppHeader
            greeting={greeting()}
            title={name ? `Olá, ${name}!` : 'Olá!'}
            subtitle="Vamos ver como está o seu dia."
            onBellPress={() => setBellOpen(true)}
          />
        }
        tabBarSpacing
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        grow
      >
        {loading ? (
          <HomeSkeleton />
        ) : (
          <>
            <JourneyPill />

            <Reveal>
              <View ref={goalTarget.ref} collapsable={false}>
                <HeroDeck
                  cards={[
                    {
                      key: 'today',
                      tone: 'brand',
                      title: 'Hoje',
                      titleIcon: 'wallet',
                      summary: todayLabel(),
                      label: data?.goalBasis === 'net' ? 'Lucro de hoje' : 'Faturamento de hoje',
                      details: [
                        {
                          label: 'Tempo',
                          value:
                            data && data.workedSeconds > 0
                              ? formatDuration(data.workedSeconds)
                              : '–',
                        },
                        {
                          label: 'Distância',
                          value: data && data.distance > 0 ? formatDistanceKm(data.distance) : '–',
                        },
                        { label: 'Despesas', value: formatCents(data?.totalExpenses ?? 0) },
                      ],
                      children: (
                        <Money
                          value={headline}
                          variant="moneyHero"
                          animate
                          style={{ color: theme.colors.textOnBrand }}
                        />
                      ),
                    },
                    {
                      key: 'goal',
                      tone: 'warm',
                      title: 'Meta de hoje',
                      titleIcon: 'target',
                      summary: goal
                        ? goal.isReached
                          ? 'Meta batida'
                          : `faltam ${formatCents(goal.remaining)}`
                        : 'ainda sem meta',
                      progress: goal?.ratio,
                      label: goal ? 'Falta para bater a meta' : 'Meta de hoje',
                      details: goal
                        ? [
                            { label: 'Meta', value: formatCents(goal.target) },
                            { label: 'Já feito', value: formatCents(goal.achieved) },
                            {
                              label: 'No seu ritmo',
                              value:
                                data?.secondsToGoal != null && data.secondsToGoal > 0
                                  ? `faltam ${formatDuration(data.secondsToGoal)}`
                                  : goal.isReached
                                    ? 'batida'
                                    : '–',
                            },
                          ]
                        : undefined,
                      onPress: () => router.push('/goals'),
                      actionLabel: goal ? 'Ajustar minha meta' : 'Definir minha meta',
                      // No goal means no figure. R$ 0,00 here would read as
                      // "nothing left to earn", which is the opposite of the
                      // truth and exactly the kind of invented number §6 bans.
                      children: goal ? (
                        <Money
                          value={goal.remaining}
                          variant="moneyHero"
                          animate
                          style={{ color: theme.colors.textOnHeroBack }}
                        />
                      ) : (
                        <Text variant="subtitle" style={{ color: theme.colors.textOnHeroBack }}>
                          Diga quanto quer ganhar por mês e o Dinamique divide em metas por dia.
                        </Text>
                      ),
                    },
                    {
                      key: 'week',
                      tone: 'deep',
                      title: 'Esta semana',
                      titleIcon: 'history',
                      summary: weekSummary(data?.week.daysWorked ?? 0),
                      label: 'Lucro da semana',
                      details: [
                        { label: 'Faturamento', value: formatCents(data?.week.grossRevenue ?? 0) },
                        { label: 'Custos', value: formatCents(data?.week.totalExpenses ?? 0) },
                        {
                          label: 'Tempo',
                          value:
                            data && data.week.workedSeconds > 0
                              ? formatDuration(data.week.workedSeconds)
                              : '–',
                        },
                      ],
                      onPress: () => router.push('/(tabs)/history'),
                      actionLabel: 'Ver o histórico da semana',
                      children: (
                        <Money
                          value={data?.week.netProfit ?? 0}
                          variant="moneyHero"
                          animate
                          style={{ color: theme.colors.textOnBrand }}
                        />
                      ),
                    },
                  ]}
                />
              </View>
            </Reveal>

            <Reveal delay={70}>
              <QuickActions
                journeyRunning={journey !== null}
                starting={journeyBusy}
                error={journeyError}
                onDismissError={dismissError}
                onStart={() => void beginJourney()}
                startRef={startTarget.ref}
              />
            </Reveal>

            <Reveal delay={140}>
              {goal ? (
                <Card padding="xl" style={{ alignItems: 'center', gap: theme.spacing.lg }}>
                  <View style={{ alignSelf: 'stretch' }}>
                    <SectionHeader
                      title="Meta de hoje"
                      actionLabel="Ajustar"
                      onAction={() => router.push('/goals')}
                    />
                  </View>
                  <ProgressRing
                    ratio={goal.ratio}
                    label={`Meta de hoje, ${Math.round(goal.ratio * 100)}%`}
                    centreLabel={`${Math.round(goal.ratio * 100)}%`}
                    centreHint={
                      goal.isReached ? 'Meta batida' : `Faltam ${formatCents(goal.remaining)}`
                    }
                    size={isCompact ? 148 : 176}
                  />
                  <Text variant="caption" color="secondary" align="center">
                    {formatCents(goal.achieved)} de {formatCents(goal.target)}
                    {data?.secondsToGoal !== null && (data?.secondsToGoal ?? 0) > 0
                      ? `. No ritmo de hoje, faltam cerca de ${formatDuration(data!.secondsToGoal!)}`
                      : ''}
                  </Text>
                </Card>
              ) : (
                <Card padding="xl" style={{ gap: theme.spacing.md }}>
                  <Text variant="subtitle">Você ainda não tem uma meta</Text>
                  <Text variant="body" color="secondary">
                    Diga quanto quer ganhar por mês e o Dinamique divide isso em metas por dia,
                    semana e ano.
                  </Text>
                  <Button
                    label="Definir minha meta"
                    variant="secondary"
                    iconName="target"
                    onPress={() => router.push('/goals')}
                  />
                </Card>
              )}
            </Reveal>

            <Reveal delay={210}>
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
                    value={
                      data?.profitPerHour === null || data?.profitPerHour === undefined
                        ? null
                        : formatCents(data.profitPerHour)
                    }
                    emptyHint="sem tempo registrado"
                  />
                  <StatTile
                    label="R$ por km"
                    icon="route"
                    value={
                      data?.revenuePerKm === null || data?.revenuePerKm === undefined
                        ? null
                        : formatCents(data.revenuePerKm)
                    }
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
            </Reveal>

            <Reveal delay={280}>
              {!data?.hasAnyData ? (
                <Card padding="none" style={{ overflow: 'hidden' }}>
                  <EmptyState
                    iconName="flag"
                    title="Nada registrado hoje ainda"
                    description="Comece uma jornada ou lance um ganho. Em poucos toques o Dinamique já mostra quanto sobrou."
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
            </Reveal>
          </>
        )}
      </Screen>

      <NotificationsSheet visible={bellOpen} onClose={() => setBellOpen(false)} />
      {consentSheets}
    </>
  );
}

/**
 * The four round actions under the hero. Round rather than rectangular so they
 * read as a toolbar and not as four more cards, and because a circle is the
 * easiest shape to hit without looking at the screen.
 *
 * The first one starts the journey where you stand instead of sending you to
 * another screen to press a second button.
 */
function QuickActions({
  journeyRunning,
  starting,
  error,
  onDismissError,
  onStart,
  startRef,
}: {
  journeyRunning: boolean;
  starting: boolean;
  error: string | null;
  onDismissError: () => void;
  onStart: () => void;
  startRef: (node: View | null) => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  const actions: { icon: IconName; label: string; onPress: () => void; primary?: boolean }[] = [
    {
      icon: journeyRunning ? 'stop' : 'play',
      label: journeyRunning ? 'Encerrar' : 'Iniciar',
      onPress: journeyRunning ? () => router.push('/journey/close') : onStart,
      primary: true,
    },
    { icon: 'arrowUpRight', label: 'Ganho', onPress: () => router.push('/(tabs)/record') },
    { icon: 'fuel', label: 'Abastecer', onPress: () => router.push('/fuel') },
    { icon: 'insights', label: 'Insights', onPress: () => router.push('/(tabs)/insights') },
  ];

  return (
    <Card padding="lg" style={{ gap: theme.spacing.md }}>
      {/* A failed write used to look exactly like a successful one. It says so
          here, next to the control that was pressed. */}
      {error ? <Notice message={error} onDismiss={onDismissError} /> : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {actions.map((action) => (
          <View
            key={action.label}
            ref={action.primary ? startRef : undefined}
            collapsable={false}
            style={{ alignItems: 'center', gap: theme.spacing.sm, flex: 1 }}
          >
            <IconButton
              icon={action.primary && starting ? 'clock' : action.icon}
              label={action.label}
              tone={action.primary ? 'brand' : 'surface'}
              size={52}
              disabled={action.primary && starting}
              onPress={action.onPress}
              style={
                action.primary
                  ? undefined
                  : { backgroundColor: theme.colors.backgroundSecondary, borderWidth: 0 }
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

/**
 * What the week card says while it is still at the back of the deck.
 *
 * Days rodados rather than a figure: the money is already that card's
 * headline, and repeating it on the strip would spend the one line a driver
 * reads without turning the card over.
 */
function weekSummary(daysWorked: number): string {
  if (daysWorked === 0) return 'nada rodado ainda';
  return daysWorked === 1 ? '1 dia rodado' : `${daysWorked} dias rodados`;
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
