import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GoalPeriod } from '@dinamique/types';
import { generateInsights, scoreLabel } from '@dinamique/business-logic';
import {
  formatCents,
  formatDistanceKm,
  formatDuration,
  formatPercent,
  monthLabel,
  toDateOnly,
  weekdayLabel,
} from '@dinamique/utils';
import {
  Card,
  Chip,
  EmptyState,
  InsightCard,
  Skeleton,
  Text,
  useTheme,
} from '@dinamique/ui';
import { usePeriodReport } from '@/features/insights/useSummary';
import { useBenchmark } from '@/features/insights/useBenchmark';

/** Dias com registro antes de qualquer insight fazer sentido. */
const MIN_DAYS = 5;

/**
 * Insights (§42–46). Interpretação, não painel: nota do dia, comparação com a
 * própria média, projeção, benchmark e o resumo do período em frases.
 */
export default function Insights() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<GoalPeriod>('weekly');
  const { report, loading, refresh } = usePeriodReport(period);
  const [refreshing, setRefreshing] = useState(false);

  const benchmark = useBenchmark(report?.summary.revenuePerKm ?? null);

  const insights = report
    ? generateInsights({
        current: report.summary,
        previous: report.previous,
        fuelSpend: report.fuelSpend,
        bestWeekday: report.bestWeekday,
        worstWeekday: report.worstWeekday,
        goalStreakDays: 0,
      }).sort((a, b) => b.magnitude - a.magnitude)
    : [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
      contentContainerStyle={{
        padding: theme.spacing.xl,
        paddingTop: insets.top + theme.spacing.lg,
        gap: theme.spacing.lg,
        flexGrow: 1,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
    >
      <Text variant="titleLg">Insights</Text>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Chip label="Semana" selected={period === 'weekly'} onPress={() => setPeriod('weekly')} />
        <Chip label="Mês" selected={period === 'monthly'} onPress={() => setPeriod('monthly')} />
        <Chip label="Ano" selected={period === 'yearly'} onPress={() => setPeriod('yearly')} />
      </View>

      {loading ? (
        <>
          <Skeleton height={120} radius={theme.radius['2xl']} />
          <Skeleton height={72} radius={theme.radius['2xl']} />
          <Skeleton height={72} radius={theme.radius['2xl']} />
        </>
      ) : !report || report.daysWithData < MIN_DAYS ? (
        <EmptyState
          title="Ainda estamos conhecendo sua rotina"
          description={`Depois de ${MIN_DAYS} dias com registros, o Dinamique começa a comparar seus resultados e apontar o que mudou.`}
        />
      ) : (
        <>
          {report.score.hasData ? (
            <Card padding="xl" style={{ gap: theme.spacing.sm }}>
              <Text variant="caption" color="secondary">
                NOTA DE HOJE
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm }}>
                <Text variant="display" color="brand">
                  {report.score.score.toFixed(1).replace('.', ',')}
                </Text>
                <Text variant="body" color="secondary">
                  de 10
                </Text>
              </View>
              <Text variant="bodyStrong">{scoreLabel(report.score.score)}</Text>
              <Text variant="caption" color="muted">
                A nota compara seu dia com a sua própria média e com a meta. Ela sobe quando você
                supera o que costuma fazer.
              </Text>
            </Card>
          ) : null}

          <Card padding="xl" style={{ gap: theme.spacing.md }}>
            <Text variant="caption" color="secondary">
              RESUMO {period === 'weekly' ? 'DA SEMANA' : period === 'monthly' ? 'DO MÊS' : 'DO ANO'}
            </Text>
            {summaryLines(report, period).map((line) => (
              <Text key={line} variant="body">
                {line}
              </Text>
            ))}
          </Card>

          {report.projection?.hasEnoughData ? (
            <Card padding="lg" style={{ gap: theme.spacing.xs }}>
              <Text variant="caption" color="secondary">
                PROJEÇÃO
              </Text>
              <Text variant="body">
                Mantendo a média atual, sua projeção para{' '}
                {period === 'monthly'
                  ? monthLabel(toDateOnly(new Date()))
                  : period === 'yearly'
                    ? 'o ano'
                    : 'a semana'}{' '}
                é {formatCents(report.projection.projectedTotal)}.
              </Text>
              <Text variant="caption" color="muted">
                É uma estimativa baseada nos {report.projection.daysElapsed} dias já registrados.
              </Text>
            </Card>
          ) : null}

          {benchmark ? (
            <Card padding="xl" style={{ gap: theme.spacing.md }}>
              <Text variant="caption" color="secondary">
                COMPARAÇÃO ANÔNIMA
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text variant="caption" color="secondary">
                    {benchmark.scope}
                  </Text>
                  <Text variant="moneyMedium">
                    {formatCents(benchmark.comparison.peerValue)}/km
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="caption" color="secondary">
                    você
                  </Text>
                  <Text variant="moneyMedium" color="brand">
                    {formatCents(benchmark.comparison.userValue)}/km
                  </Text>
                </View>
              </View>
              <Text
                variant="bodyStrong"
                color={benchmark.comparison.difference >= 0 ? 'success' : 'warning'}
              >
                {benchmark.comparison.difference >= 0 ? '+' : ''}
                {formatPercent(benchmark.comparison.difference, 1)} em relação a eles
              </Text>
              <Text variant="caption" color="muted">
                Média de {benchmark.comparison.sampleSize} motoristas. Nenhum dado individual de
                outra pessoa é mostrado aqui.
              </Text>
            </Card>
          ) : null}

          {insights.length > 0 ? (
            <View style={{ gap: theme.spacing.md }}>
              <Text variant="captionStrong" color="secondary">
                O QUE MUDOU
              </Text>
              {insights.map((insight) => (
                <InsightCard key={insight.key} insight={insight} />
              ))}
            </View>
          ) : (
            <Card padding="lg">
              <Text variant="body" color="secondary">
                Seus números estão em linha com a sua média. Isso também é uma informação.
              </Text>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

/** Resumo automático em frases (§54) — cada uma só aparece se tiver dado real. */
function summaryLines(
  report: NonNullable<ReturnType<typeof usePeriodReport>['report']>,
  period: GoalPeriod,
): string[] {
  const { summary, bestDay } = report;
  const lines: string[] = [];

  if (summary.workedSeconds > 0) {
    lines.push(`Você trabalhou ${formatDuration(summary.workedSeconds)}.`);
  }
  if (summary.distance > 0) {
    lines.push(`Percorreu ${formatDistanceKm(summary.distance)}.`);
  }
  lines.push(`Faturou ${formatCents(summary.grossRevenue)}.`);
  lines.push(`Teve ${formatCents(summary.totalExpenses)} em custos estimados.`);
  lines.push(`Seu lucro estimado foi ${formatCents(summary.netProfit)}.`);

  if (summary.profitPerHour !== null) {
    lines.push(`Isso dá ${formatCents(summary.profitPerHour)} por hora trabalhada.`);
  }
  if (summary.revenuePerKm !== null) {
    lines.push(`E ${formatCents(summary.revenuePerKm)} por quilômetro rodado.`);
  }
  if (summary.tripCount > 0 && summary.averageTicket !== null) {
    lines.push(
      `Foram ${summary.tripCount} corridas ou entregas, a ${formatCents(summary.averageTicket)} cada.`,
    );
  }
  if (bestDay && period !== 'daily') {
    lines.push(
      `Seu melhor dia foi ${weekdayLabel(bestDay.date)}, com ${formatCents(bestDay.profit)} de lucro.`,
    );
  }

  return lines;
}
