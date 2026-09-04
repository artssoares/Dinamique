import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DateOnly } from '@dinamique/types';
import { formatCents, formatDistanceKm, formatDuration } from '@dinamique/utils';
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
import { JourneyFilmCard } from '@/features/film/JourneyFilmCard';
import { longDateLabel } from '@/features/route/routeDates';
import { useDayJourneys } from '@/features/route/useJourneyRoute';
import { useDaySummary } from '@/features/route/useJourneySummary';

/**
 * Um dia do histórico, aberto.
 *
 * O resumo é o principal e aparece sempre; os filmes são o extra e aparecem
 * quando existe trajeto. Foi ao contrário disso primeiro (a tela só abria se
 * houvesse desenho) e o resultado é que tocar num dia comum não levava a
 * lugar nenhum, mesmo com o dia inteiro de dinheiro e horas guardado ali.
 *
 * Cada jornada com trajeto vira um filme, já tocando: o caminho sendo
 * desenhado sobre o satélite, a câmera virando com a rua, e o lucro no fim.
 * Existe por um motivo que não é métrica nenhuma: o motorista termina o dia
 * cansado e quase nunca com algo bonito para mostrar do que fez.
 */
export default function JourneyDay() {
  const theme = useTheme();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const day = (date ?? null) as DateOnly | null;

  const { journeys, loading: findingJourneys } = useDayJourneys(day);
  const { summary, loading: loadingSummary } = useDaySummary(day);

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
                  : '– sem jornada'
              }
            />
            <Row
              label="Distância"
              value={
                summary.distance !== null
                  ? formatDistanceKm(summary.distance, 1)
                  : '– sem km informado'
              }
            />
            <Row
              label="Faturamento por km"
              value={
                summary.revenuePerKm !== null
                  ? formatCents(summary.revenuePerKm)
                  : '– sem km informado'
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

      {findingJourneys ? (
        <Skeleton height={480} radius={theme.radius['2xl']} />
      ) : journeys.length > 0 ? (
        journeys.map((journey, index) => (
          <JourneyFilmCard
            key={journey.id}
            journeyId={journey.id}
            label={journeys.length > 1 ? `FILME DA ${index + 1}ª JORNADA` : 'FILME DO DIA'}
          />
        ))
      ) : summary ? (
        // Uma linha, não uma tela vazia: o dia tem conteúdo, só não tem
        // desenho. Quem nunca ligou o GPS não precisa de um cartaz sobre isso.
        <Text variant="caption" color="muted">
          Sem trajeto neste dia. Fazemos o filme dos dias em que a contagem por GPS
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
