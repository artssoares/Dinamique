import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
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
  Button,
  Card,
  EmptyState,
  Icon,
  InsightCard,
  ProgressRing,
  Screen,
  SectionHeader,
  SegmentedControl,
  Skeleton,
  Text,
  useTheme,
} from '@dinamique/ui';
import { AppHeader } from '@/features/shell/AppHeader';
import { usePeriodReport } from '@/features/insights/useSummary';
import { useBenchmark } from '@/features/insights/useBenchmark';

/**
 * Dias com registro a partir dos quais a comparação entre um período e o
 * anterior tem base para se sustentar.
 *
 * Não é mais um portão. Durante muito tempo a aba inteira ficava atrás de uma
 * tela vazia até o quinto dia, o que significava que a parte do produto que
 * mais tem a dizer ficava calada justamente para quem tinha acabado de chegar.
 * Agora a nota, a meta e o resumo aparecem desde o primeiro registro, e este
 * número só decide se ainda vale avisar que a leitura vai melhorar.
 */
const MIN_DAYS = 5;

/**
 * Insights (§42–46). Interpretação, não painel: nota do dia, comparação com a
 * própria média, projeção, benchmark e o resumo do período em frases.
 */
export default function Insights() {
  const theme = useTheme();
  const router = useRouter();
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
        // A real figure at last. This was hard-coded to zero, so the one
        // insight that rewards showing up rather than earning more could
        // never appear for anybody.
        goalStreakDays: report.goalStreak,
      }).sort((a, b) => b.magnitude - a.magnitude)
    : [];

  // Nada registrado é a única situação em que esta aba não tem o que dizer.
  // Um dia registrado já tem: a nota, a meta e o resumo do dia.
  const nothingYet = !report || report.daysWithData === 0;
  const stillLearning = Boolean(report && report.daysWithData > 0 && report.daysWithData < MIN_DAYS);

  return (
    <Screen
      header={<AppHeader title="Insights" subtitle="O que os seus números estão dizendo" />}
      gap="lg"
      tabBarSpacing
      grow
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
      <SegmentedControl
        label="Período"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'weekly', label: 'Semana' },
          { value: 'monthly', label: 'Mês' },
          { value: 'yearly', label: 'Ano' },
        ]}
      />

      {loading ? (
        <>
          <Skeleton height={120} radius={theme.radius['2xl']} />
          <Skeleton height={72} radius={theme.radius['2xl']} />
          <Skeleton height={72} radius={theme.radius['2xl']} />
        </>
      ) : nothingYet || !report ? (
        <EmptyState
          iconName="compass"
          title="Ainda não há nada para interpretar"
          description="Registre um ganho ou feche uma jornada e o Dinamique já começa a ler os seus números aqui."
          actionLabel="Registrar agora"
          onAction={() => router.push('/(tabs)/record')}
        />
      ) : (
        <>
          {/* O aviso vem antes de tudo porque muda como se lê o que vem
              depois. É uma promessa, não um pedido de desculpas: os números
              já valem, e vão ficar melhores. */}
          {stillLearning ? <LearningNotice days={report.daysWithData} /> : null}

          <GoalSection report={report} period={period} onAdjust={() => router.push('/goals')} />

          {report.score.hasData ? (
            <Card padding="xl" style={{ gap: theme.spacing.lg, alignItems: 'center' }}>
              <View style={{ alignSelf: 'stretch' }}>
                <SectionHeader title="Nota de hoje" />
              </View>
              <ProgressRing
                ratio={report.score.score / 10}
                label={`Nota de hoje, ${report.score.score.toFixed(1)} de 10`}
                centreLabel={report.score.score.toFixed(1).replace('.', ',')}
                centreHint="de 10"
                size={148}
              />
              <Text variant="bodyStrong" align="center">
                {scoreLabel(report.score.score)}
              </Text>
              <Text variant="caption" color="muted" align="center">
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

          {/* Só quando não há meta. Com uma meta na tela, o cartão dela já
              diz onde o ritmo atual termina, e repetir o mesmo número com
              outro rótulo faz o motorista procurar a diferença entre os
              dois. */}
          {!report.goal && report.projection?.hasEnoughData ? (
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
              <SectionHeader title="O que mudou" />
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
    </Screen>
  );
}

/**
 * O aviso de que a leitura ainda está se formando.
 *
 * A versão anterior disto era uma tela vazia que segurava a aba inteira por
 * cinco dias. Um motorista que acabou de instalar o aplicativo abria Insights,
 * lia que ele não tinha nada a dizer, e não voltava. E Insights é justamente
 * a parte do produto que justifica o resto. Agora tudo aparece desde o
 * primeiro registro e este cartão só enquadra o que está sendo mostrado.
 */
function LearningNotice({ days }: { days: number }) {
  const theme = useTheme();
  const remaining = Math.max(1, MIN_DAYS - days);

  return (
    <Card padding="lg" tone="brand" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name="compass" size={18} color={theme.colors.brandPrimary} />
        <Text variant="captionStrong" color="brand">
          SEUS INSIGHTS ESTÃO COMEÇANDO
        </Text>
      </View>
      <Text variant="body">
        {days === 1
          ? 'Com um dia registrado já dá para ver a sua nota, a sua meta e o resumo do que entrou e saiu.'
          : `Com ${days} dias registrados já dá para ver a sua nota, a sua meta e o resumo do que entrou e saiu.`}
      </Text>
      <Text variant="caption" color="secondary">
        {remaining === 1
          ? 'Falta um dia de registro para o Dinamique começar a comparar uma semana com a outra e apontar o que mudou.'
          : `Faltam ${remaining} dias de registro para o Dinamique começar a comparar uma semana com a outra e apontar o que mudou.`}{' '}
        Quanto mais você usa, mais fundo ele consegue ir.
      </Text>
    </Card>
  );
}

/**
 * A meta, dentro de Insights.
 *
 * Faltava por completo: a aba media tempo, custo e ritmo e nunca dizia se o
 * motorista estava perto do número que ele mesmo escolheu, que é a única
 * pergunta que ele faz todo dia. A sequência aparece aqui porque é aqui que
 * ela significa alguma coisa.
 */
function GoalSection({
  report,
  period,
  onAdjust,
}: {
  report: NonNullable<ReturnType<typeof usePeriodReport>['report']>;
  period: GoalPeriod;
  onAdjust: () => void;
}) {
  const theme = useTheme();
  const { goal, goalStreak, goalBasis } = report;

  if (!goal) {
    return (
      <Card padding="xl" style={{ gap: theme.spacing.md }}>
        <Text variant="subtitle">Você ainda não tem uma meta</Text>
        <Text variant="body" color="secondary">
          Diga quanto quer ganhar por mês e o Dinamique divide isso em metas por dia, semana e
          ano. É com ela que a sua nota e boa parte dos insights passam a fazer sentido.
        </Text>
        <Button label="Definir minha meta" variant="secondary" iconName="target" onPress={onAdjust} />
      </Card>
    );
  }

  const percent = Math.round(goal.ratio * 100);

  return (
    <Card padding="xl" style={{ gap: theme.spacing.lg, alignItems: 'center' }}>
      <View style={{ alignSelf: 'stretch' }}>
        <SectionHeader
          title={`Meta ${periodNoun(period)}`}
          actionLabel="Ajustar"
          onAction={onAdjust}
        />
      </View>

      <ProgressRing
        ratio={goal.ratio}
        label={`Meta ${periodNoun(period)}, ${percent}%`}
        centreLabel={`${percent}%`}
        centreHint={goal.isReached ? 'Meta batida' : `Faltam ${formatCents(goal.remaining)}`}
        size={148}
      />

      <View style={{ alignSelf: 'stretch', gap: theme.spacing.sm }}>
        <GoalRow label={goalBasis === 'net' ? 'Meta de lucro' : 'Meta de faturamento'} value={formatCents(goal.target)} />
        <GoalRow label="Já feito" value={formatCents(goal.achieved)} />
        <GoalRow
          label="Falta"
          value={goal.isReached ? 'nada, meta batida' : formatCents(goal.remaining)}
        />
        {/* Só com dias pela frente. "Faltam R$ 0,00 por dia em zero dias" é
            exatamente o número inventado que o §6 proíbe. */}
        {goal.requiredPerRemainingDay !== null && goal.daysRemaining > 0 ? (
          <GoalRow
            label={goal.daysRemaining === 1 ? 'Para hoje' : `Por dia, nos ${goal.daysRemaining} que faltam`}
            value={formatCents(goal.requiredPerRemainingDay)}
          />
        ) : null}
      </View>

      {goal.projectedTotal !== null ? (
        <Text variant="caption" color="secondary" align="center">
          {goal.onTrack
            ? `No ritmo de agora, você termina com ${formatCents(goal.projectedTotal)}. Está no caminho.`
            : `No ritmo de agora, você termina com ${formatCents(goal.projectedTotal)}, abaixo da meta.`}
        </Text>
      ) : null}

      {goalStreak > 0 ? (
        <View
          style={{
            alignSelf: 'stretch',
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingTop: theme.spacing.sm,
            borderTopWidth: 1,
            borderTopColor: theme.colors.borderSubtle,
          }}
        >
          <Icon name="flag" size={17} color={theme.colors.successText} />
          <Text variant="captionStrong" style={{ flex: 1 }}>
            {goalStreak === 1
              ? 'Você bateu a meta de ontem.'
              : `Você bateu a meta ${goalStreak} dias seguidos.`}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

function GoalRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="captionStrong">{value}</Text>
    </View>
  );
}

function periodNoun(period: GoalPeriod): string {
  if (period === 'weekly') return 'da semana';
  if (period === 'monthly') return 'do mês';
  if (period === 'yearly') return 'do ano';
  return 'de hoje';
}

/** Resumo automático em frases (§54) – cada uma só aparece se tiver dado real. */
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
