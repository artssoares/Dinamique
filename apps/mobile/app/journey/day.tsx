import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DateOnly } from '@dinamique/types';
import { formatCents, formatDistanceKm, formatDuration, toDateOnly } from '@dinamique/utils';
import {
  Button,
  Card,
  EmptyState,
  Money,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  useTheme,
} from '@dinamique/ui';
import { track } from '@/lib/analytics';
import { RouteReplay } from '@/features/route/RouteReplay';
import { useStoryShare } from '@/features/route/useStoryShare';
import { longDateLabel } from '@/features/route/routeDates';
import { useDayJourney, useJourneyRoute } from '@/features/route/useJourneyRoute';
import { useDaySummary } from '@/features/route/useJourneySummary';

/**
 * Um dia do histórico, aberto.
 *
 * O resumo é o principal e aparece sempre; o trajeto é o extra e aparece
 * quando existe. Foi ao contrário disso primeiro — a tela só abria se houvesse
 * desenho — e o resultado é que tocar num dia comum não levava a lugar nenhum,
 * mesmo com o dia inteiro de dinheiro e horas guardado ali.
 *
 * O desenho do caminho existe por um motivo que não é métrica nenhuma: o
 * motorista termina o dia cansado e quase nunca com algo bonito para mostrar
 * do que fez. É o mesmo dado que já estava ali, apenas visto de outro jeito.
 */
export default function JourneyDay() {
  const theme = useTheme();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const day = (date ?? null) as DateOnly | null;

  const { journeyId, loading: findingJourney } = useDayJourney(day);
  const { route, loading: loadingRoute } = useJourneyRoute(journeyId);
  const { summary, loading: loadingSummary } = useDaySummary(day);

  // Emitido uma vez por trajeto aberto. Sem isso, um `useEffect` com o objeto
  // da rota nas dependências mandaria um evento a cada re-render da tela.
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!route || reported.current === route.journeyId) return;
    reported.current = route.journeyId;
    void track('route_replay_viewed', { points: route.points.length });
  }, [route]);

  const hasRoute = Boolean(route && route.points.length >= 1);

  // Built whether or not there is a route: hooks cannot be conditional, and
  // `canShare` already answers the only question the screen asks of it.
  const story = useStoryShare({
    points: route?.points ?? [],
    date: day ?? toDateOnly(new Date()),
    distance: summary?.distance ?? route?.distance ?? null,
    workedSeconds: summary?.workedSeconds ?? 0,
    revenuePerKm: summary?.revenuePerKm ?? null,
    grossRevenue: summary?.grossRevenue ?? 0,
  });
  // O trajeto pode continuar carregando depois que o resumo chegou. Só o
  // resumo segura a tela: o dinheiro é o que a pessoa veio ver.
  const loadingRoutePanel = findingJourney || loadingRoute;

  return (
    <Screen
      header={
        <ScreenHeader
          title={day ? longDateLabel(day) : 'Seu dia'}
          onBack={() => router.back()}
        />
      }
    >
      {loadingSummary ? (
        <Skeleton height={200} radius={theme.radius['2xl']} />
      ) : summary ? (
        <Card padding="xl" style={{ gap: theme.spacing.lg }}>
          <Text variant="caption" color="secondary">
            LUCRO ESTIMADO DO DIA
          </Text>
          <Money value={summary.netProfit} variant="moneyHero" colorBySign animate />

          <View style={{ gap: theme.spacing.sm }}>
            <Row label="Faturamento" value={formatCents(summary.grossRevenue)} />
            <Row label="Custos" value={formatCents(summary.totalExpenses)} />
            <Row
              label="Tempo trabalhado"
              value={
                summary.workedSeconds > 0
                  ? formatDuration(summary.workedSeconds)
                  : '— sem jornada'
              }
            />
            <Row
              label="Distância"
              value={
                summary.distance !== null
                  ? formatDistanceKm(summary.distance, 1)
                  : '— sem km informado'
              }
            />
            <Row
              label="Faturamento por km"
              value={
                summary.revenuePerKm !== null
                  ? formatCents(summary.revenuePerKm)
                  : '— sem km informado'
              }
            />
          </View>
        </Card>
      ) : (
        <EmptyState
          iconName="history"
          title="Nada registrado neste dia"
          description="Sem ganhos, gastos ou jornadas guardados para esta data."
        />
      )}

      {loadingRoutePanel ? (
        <Skeleton height={260} radius={theme.radius['2xl']} />
      ) : hasRoute && route ? (
        <>
          <Card padding="lg" style={{ gap: theme.spacing.md }}>
            <Text variant="caption" color="secondary">
              SEU TRAJETO
            </Text>
            <RouteReplay
              points={route.points}
              distance={summary?.distance ?? route.distance}
              onPress={story.canShare ? story.open : undefined}
            />
            {story.canShare ? (
              <Button
                label="Compartilhar meu trajeto"
                size="lg"
                fullWidth
                iconName="arrowUpRight"
                onPress={story.open}
              />
            ) : null}
          </Card>
          {story.sheet}
        </>
      ) : summary ? (
        // Uma linha, não uma tela vazia: o dia tem conteúdo, só não tem
        // desenho. Quem nunca ligou o GPS não precisa de um cartaz sobre isso.
        <Text variant="caption" color="muted">
          Sem trajeto neste dia. Desenhamos o caminho dos dias em que a contagem por GPS
          estava ligada.
        </Text>
      ) : null}

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
