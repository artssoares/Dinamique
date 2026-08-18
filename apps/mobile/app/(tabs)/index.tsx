import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatCents, formatDuration } from '@dinamique/utils';
import {
  Button,
  Card,
  CountBadge,
  CurrencyMetric,
  EmptyState,
  GoalProgress,
  Metric,
  Money,
  Skeleton,
  Text,
  useTheme,
} from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';
import { useToday } from '@/hooks/useToday';
import { useNotificationCounts } from '@/hooks/useNotifications';

/**
 * Home. The target is comprehension in about five seconds (§24): who you are,
 * how the goal is going, and what to do next. Everything else is secondary.
 */
export default function Today() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useSession();
  const { data, loading, refresh } = useToday();
  const { unreadTotal } = useNotificationCounts();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const name = profile?.preferredName ?? profile?.firstName ?? '';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
      contentContainerStyle={{
        padding: theme.spacing.xl,
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: theme.spacing['5xl'],
        gap: theme.spacing.xl,
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Header name={name} unread={unreadTotal} onBellPress={() => router.push('/notifications')} />

      {loading ? (
        <HomeSkeleton />
      ) : !data?.hasAnyData && !data?.goal ? (
        <EmptyState
          title="Você ainda não registrou nada hoje"
          description="Comece uma jornada ou lance um ganho para o Dinamique começar a calcular."
          actionLabel="Iniciar jornada"
          onAction={() => router.push('/(tabs)/record')}
        />
      ) : (
        <>
          {data?.goal ? (
            <Card padding="xl" style={{ gap: theme.spacing.lg }}>
              <View style={{ gap: theme.spacing.xxs }}>
                <Text variant="caption" color="secondary">
                  {data.goalBasis === 'net' ? 'Lucro de hoje' : 'Faturamento de hoje'}
                </Text>
                <Money
                  value={data.goalBasis === 'net' ? data.netProfit : data.grossRevenue}
                  variant="moneyHero"
                  animate
                />
              </View>

              <GoalProgress progress={data.goal} label="Meta de hoje" />

              {data.secondsToGoal !== null && data.secondsToGoal > 0 ? (
                <Text variant="caption" color="secondary">
                  No ritmo de hoje, faltam cerca de {formatDuration(data.secondsToGoal)}.
                </Text>
              ) : null}
            </Card>
          ) : (
            <Card padding="xl" style={{ gap: theme.spacing.md }}>
              <Text variant="caption" color="secondary">
                Faturamento de hoje
              </Text>
              <Money value={data?.grossRevenue ?? 0} variant="moneyHero" animate />
              <Button
                label="Definir uma meta"
                variant="secondary"
                size="sm"
                onPress={() => router.push('/goals')}
              />
            </Card>
          )}

          <Button
            label="Iniciar jornada"
            size="lg"
            fullWidth
            onPress={() => router.push('/(tabs)/record')}
          />

          <Card padding="lg" style={{ gap: theme.spacing.lg }}>
            <Text variant="captionStrong" color="secondary">
              HOJE
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <CurrencyMetric label="Lucro" value={data?.netProfit ?? 0} />
              <CurrencyMetric
                label="R$/hora"
                value={data?.profitPerHour ?? null}
                emptyHint="sem tempo registrado"
              />
              <CurrencyMetric
                label="R$/km"
                value={data?.revenuePerKm ?? null}
                emptyHint="sem km"
              />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Metric
                label="Tempo trabalhado"
                value={data && data.workedSeconds > 0 ? formatDuration(data.workedSeconds) : null}
                emptyHint="nenhuma jornada"
              />
              <Metric
                label="Despesas"
                value={data ? formatCents(data.totalExpenses) : null}
              />
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function Header({
  name,
  unread,
  onBellPress,
}: {
  name: string;
  unread: number;
  onBellPress: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Avatar name={name} />
        <View>
          <Text variant="caption" color="secondary">
            {greeting()}
          </Text>
          <Text variant="title">{name || 'Bem-vindo'}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Notificações, ${unread} não lidas` : 'Notificações'}
        onPress={onBellPress}
        style={{
          width: 44,
          height: 44,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.surfacePrimary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="subtitle">🔔</Text>
        {unread > 0 ? (
          <CountBadge count={unread} style={{ position: 'absolute', top: 2, right: 2 }} />
        ) : null}
      </Pressable>
    </View>
  );
}

/** Initials rather than a generic silhouette when there is no photo (§19). */
function Avatar({ name }: { name: string }) {
  const theme = useTheme();
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.brandPrimarySubtle,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="bodyStrong" color="brand">
        {initials || '·'}
      </Text>
    </View>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function HomeSkeleton() {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Skeleton height={180} radius={theme.radius['2xl']} />
      <Skeleton height={52} radius={theme.radius.lg} />
      <Skeleton height={140} radius={theme.radius['2xl']} />
    </View>
  );
}
