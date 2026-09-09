import { View } from 'react-native';
import type { GoalPeriod } from '@dinamique/types';
import type { PeriodSummary } from '@dinamique/business-logic';
import { formatCents, formatDistanceKm, formatDuration, formatPercent } from '@dinamique/utils';
import {
  Card,
  RatioBar,
  SectionHeader,
  StatGrid,
  StatTile,
  Text,
  useTheme,
} from '@dinamique/ui';

/**
 * The period's numbers, drawn the same way on Histórico and on Insights.
 *
 * It replaces two different renderings of the same figures: a grid of six
 * identical white tiles on Histórico, and a paragraph of eight sentences on
 * Insights ("Você trabalhou 3h47. Percorreu 33 km. Faturou R$ 815,90."). Both
 * told the truth and neither could be read at a glance, because a list of
 * sentences has no hierarchy and a grid in one colour has none either.
 *
 * So: one headline with the figure that matters, a bar that shows the split
 * before any number is read, and tiles grouped by the question they answer.
 * What does each hour and each kilometre pay, and how much did I actually do.
 */

/** "DA SEMANA", for the overline that names the period on screen. */
export function periodWord(period: GoalPeriod): string {
  switch (period) {
    case 'daily':
      return 'DO DIA';
    case 'weekly':
      return 'DA SEMANA';
    case 'monthly':
      return 'DO MÊS';
    case 'yearly':
      return 'DO ANO';
  }
}

export interface PeriodHeadlineProps {
  summary: PeriodSummary;
  period: GoalPeriod;
  /** The same period, one period back. Drives the comparison line. */
  previous?: PeriodSummary | null;
}

/** What came in, what left, and what stayed: as a figure and as a shape. */
export function PeriodHeadline({ summary, period, previous }: PeriodHeadlineProps) {
  const theme = useTheme();
  const negative = summary.netProfit < 0;

  // Only compare against a period that actually had revenue. "+400% sobre uma
  // semana em que você não trabalhou" is noise, not information.
  const change =
    previous && previous.grossRevenue > 0 && previous.netProfit !== 0
      ? (summary.netProfit - previous.netProfit) / Math.abs(previous.netProfit)
      : null;

  return (
    <Card padding="xl" style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.xxs }}>
        <Text variant="overline" color="secondary">
          LUCRO ESTIMADO {periodWord(period)}
        </Text>
        <Text variant="moneyLarge" color={negative ? 'danger' : 'success'}>
          {formatCents(summary.netProfit)}
        </Text>
        <Text variant="caption" color="secondary">
          de {formatCents(summary.grossRevenue)} faturados
          {change !== null ? ` · ${formatPercent(change, 0)} sobre o período anterior` : ''}
        </Text>
      </View>

      <RatioBar
        height={14}
        segments={[
          {
            label: 'Ficou com você',
            amount: Math.max(0, summary.netProfit),
            tone: 'success',
            display: formatCents(summary.netProfit),
          },
          {
            label: 'Foi para custos',
            amount: summary.totalExpenses,
            tone: 'danger',
            display: formatCents(summary.totalExpenses),
          },
        ]}
      />

      {summary.expenseRatio !== null ? (
        <Text variant="caption" color="muted">
          {formatPercent(summary.expenseRatio, 0)} de tudo que entrou foi embora em custos.
        </Text>
      ) : null}
    </Card>
  );
}

export interface PeriodMetricsProps {
  summary: PeriodSummary;
  /** Days in the period with anything recorded: the divisor for the average. */
  daysWithData: number;
}

/**
 * Every figure the app already keeps, grouped and coloured.
 *
 * Nothing here is invented: a metric with no denominator renders an en dash and
 * says why, exactly as `StatTile` requires (§6).
 */
export function PeriodMetrics({ summary, daysWithData }: PeriodMetricsProps) {
  const theme = useTheme();

  const dailyAverage = daysWithData > 0 ? Math.round(summary.netProfit / daysWithData) : null;

  return (
    <>
      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader title="Quanto cada hora e cada km pagam" />
        <StatGrid>
          <StatTile
            variant="tinted"
            tone="brand"
            icon="clock"
            label="Ganho por hora"
            value={summary.revenuePerHour === null ? null : formatCents(summary.revenuePerHour)}
            emptyHint="sem jornada registrada"
          />
          <StatTile
            variant="tinted"
            tone={summary.profitPerHour !== null && summary.profitPerHour < 0 ? 'danger' : 'success'}
            icon="trendUp"
            label="Lucro por hora"
            value={summary.profitPerHour === null ? null : formatCents(summary.profitPerHour)}
            emptyHint="sem jornada registrada"
          />
          <StatTile
            variant="tinted"
            tone="danger"
            icon="receipt"
            label="Custo por hora"
            value={summary.costPerHour === null ? null : formatCents(summary.costPerHour)}
            emptyHint="sem jornada registrada"
          />
          <StatTile
            variant="tinted"
            tone="brand"
            icon="route"
            label="Ganho por km"
            value={summary.revenuePerKm === null ? null : formatCents(summary.revenuePerKm)}
            emptyHint="sem km registrado"
          />
          <StatTile
            variant="tinted"
            tone="danger"
            icon="fuel"
            label="Custo por km"
            value={summary.costPerKm === null ? null : formatCents(summary.costPerKm)}
            hint="só custos do veículo"
            emptyHint="sem km registrado"
          />
          <StatTile
            variant="tinted"
            tone="accent"
            icon="coins"
            label="Ticket médio"
            value={summary.averageTicket === null ? null : formatCents(summary.averageTicket)}
            emptyHint="sem corridas informadas"
          />
        </StatGrid>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <SectionHeader title="Quanto você rodou" />
        <StatGrid>
          <StatTile
            variant="tinted"
            tone="accent"
            icon="box"
            label="Corridas e vendas"
            value={summary.tripCount > 0 ? String(summary.tripCount) : null}
            emptyHint="você não informou a quantidade"
          />
          <StatTile
            variant="tinted"
            tone="neutral"
            icon="clock"
            label="Tempo trabalhado"
            value={summary.workedSeconds > 0 ? formatDuration(summary.workedSeconds) : null}
            emptyHint="nenhuma jornada encerrada"
          />
          <StatTile
            variant="tinted"
            tone="neutral"
            icon="route"
            label="Distância"
            value={summary.distance > 0 ? formatDistanceKm(summary.distance) : null}
            emptyHint="sem km"
          />
          <StatTile
            variant="tinted"
            tone="neutral"
            icon="calendar"
            label="Dias com registro"
            value={daysWithData > 0 ? String(daysWithData) : null}
            emptyHint="nada lançado ainda"
          />
          <StatTile
            variant="tinted"
            tone={dailyAverage !== null && dailyAverage < 0 ? 'danger' : 'success'}
            icon="scale"
            label="Média por dia"
            value={dailyAverage === null ? null : formatCents(dailyAverage)}
            hint="lucro ÷ dias com registro"
            emptyHint="nada lançado ainda"
          />
          <StatTile
            variant="tinted"
            tone="warning"
            icon="wallet"
            label="Gorjetas"
            value={summary.tips > 0 ? formatCents(summary.tips) : null}
            emptyHint="nenhuma registrada"
          />
        </StatGrid>
      </View>
    </>
  );
}
