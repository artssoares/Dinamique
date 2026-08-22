import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DateOnly } from '@dinamique/types';
import { formatCents, formatDistanceKm, formatDuration } from '@dinamique/utils';
import { Button, Card, EmptyState, Screen, ScreenHeader, Skeleton, Text, useTheme } from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { RouteReplay } from '@/features/route/RouteReplay';
import { longDateLabel } from '@/features/route/routeDates';
import { useDayJourney, useJourneyRoute } from '@/features/route/useJourneyRoute';
import { useDaySummary } from '@/features/route/useJourneySummary';

/**
 * O trajeto de um dia.
 *
 * Chega pelo histórico, e existe por um motivo que não é métrica nenhuma: o
 * motorista termina o dia cansado e quase nunca com algo bonito para mostrar
 * do que fez. O desenho do caminho é isso — e é o mesmo dado que já estava
 * ali, apenas visto de outro jeito.
 */
export default function JourneyReplay() {
  const theme = useTheme();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const day = (date ?? null) as DateOnly | null;

  const { journeyId, loading: findingJourney } = useDayJourney(day);
  const { route, loading: loadingRoute } = useJourneyRoute(journeyId);
  const { summary } = useDaySummary(day);

  // Emitido uma vez por trajeto aberto. Sem isso, um `useEffect` com o objeto
  // da rota nas dependências mandaria um evento a cada re-render da tela.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!route || reported.current === route.journeyId) return;
    reported.current = route.journeyId;
    void track('route_replay_viewed', { points: route.points.length });
  }, [route]);

  const loading = findingJourney || loadingRoute;

  return (
    <Screen
      header={
        <ScreenHeader
          title="Seu trajeto"
          subtitle={day ? longDateLabel(day) : undefined}
          onBack={() => router.back()}
        />
      }
    >
      {loading ? (
        <Skeleton height={260} radius={theme.radius['2xl']} />
      ) : route && route.points.length >= 2 ? (
        <>
          <Card padding="lg" style={{ gap: theme.spacing.md }}>
            <RouteReplay points={route.points} distance={summary?.distance ?? route.distance} />
          </Card>

          {summary ? (
            <Card padding="lg" style={{ gap: theme.spacing.sm }}>
              <Row
                label="Distância"
                value={summary.distance !== null ? formatDistanceKm(summary.distance, 1) : '— sem km informado'}
              />
              <Row label="Tempo trabalhado" value={formatDuration(summary.workedSeconds)} />
              <Row label="Faturamento" value={formatCents(summary.grossRevenue)} />
              <Row
                label="Faturamento por km"
                value={
                  summary.revenuePerKm !== null
                    ? formatCents(summary.revenuePerKm)
                    : '— sem km informado'
                }
              />
            </Card>
          ) : null}
        </>
      ) : (
        <EmptyState
          iconName="route"
          title="Sem trajeto neste dia"
          description="Só desenhamos o caminho dos dias em que a contagem por GPS estava ligada."
        />
      )}

      <Button
        label="Voltar"
        variant="secondary"
        size="lg"
        fullWidth
        onPress={() => router.back()}
      />
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="body" color="secondary">
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}
