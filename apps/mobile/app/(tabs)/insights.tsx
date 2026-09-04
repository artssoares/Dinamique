import { useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { GoalPeriod } from '@dinamique/types';
import { generateInsights, scoreLabel } from '@dinamique/business-logic';
import {
  formatCents,
  formatPercent,
  monthLabel,
  toDateOnly,
  weekdayLabel,
} from '@dinamique/utils';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  InsightCard,
  ProgressRing,
  RatioBar,
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
import { PeriodHeadline, PeriodMetrics, periodWord } from '@/features/insights/PeriodMetrics';

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
 * Insights (§42–46). Interpretação, não painel: nota do dia, meta, comparação
 * com a própria média, projeção, benchmark e o resumo do período.
 *
 * O resumo era um parágrafo: oito frases do mesmo tamanho e da mesma cor, cada
 * uma carregando um número. "Você trabalhou 3h47. Percorreu 33 km. Faturou
 * R$ 815,90." Estava tudo certo e nada chegava antes de nada, porque uma lista
 * de frases não tem hierarquia. Agora é o mesmo bloco que o Histórico usa, com
 * destaque, cor e grupos, e com os números que o aplicativo já calculava e
 * nunca mostrava: custo por hora, custo por km, corridas e vendas, ticket
 * médio, gorjetas e a média por dia.
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

          {report.score.hasData ? <ScoreCard score={report.score.score} /> : null}

          <PeriodHeadline summary={report.summary} period={period} previous={report.previous} />

          <PeriodMetrics summary={report.summary} daysWithData={report.daysWithData} />

          {report.bestDay && period !== 'daily' ? (
            <Card
              padding="lg"
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
            >
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.successSubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="flag" size={20} color={theme.colors.successText} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="overline" color="secondary">
                  MELHOR DIA {periodWord(period)}
                </Text>
                <Text variant="bodyStrong">
                  {weekdayLabel(report.bestDay.date)} · {formatCents(report.bestDay.profit)} de lucro
                </Text>
              </View>
            </Card>
          ) : null}

          {/* Só quando não há meta. Com uma meta na tela, o cartão dela já
              diz onde o ritmo atual termina, e repetir o mesmo número com
              outro rótulo faz o motorista procurar a diferença entre os
              dois. */}
          {!report.goal && report.projection?.hasEnoughData ? (
            <Card padding="lg" tone="brand" style={{ gap: theme.spacing.xs }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Icon name="trendUp" size={16} color={theme.colors.brandPrimaryText} />
                <Text variant="overline" color="brand">
                  PROJEÇÃO
                </Text>
              </View>
              <Text variant="moneyMedium" color="brand">
                {formatCents(report.projection.projectedTotal)}
              </Text>
              <Text variant="caption" color="secondary">
                É onde você fecha{' '}
                {period === 'monthly'
                  ? monthLabel(toDateOnly(new Date()))
                  : period === 'yearly'
                    ? 'o ano'
                    : 'a semana'}{' '}
                mantendo a média atual, estimado a partir dos {report.projection.daysElapsed} dias
                já registrados.
              </Text>
            </Card>
          ) : null}

          {benchmark ? <BenchmarkCard benchmark={benchmark} /> : null}

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

/** A nota do dia, com a cor dizendo a mesma coisa que o número. */
function ScoreCard({ score }: { score: number }) {
  const theme = useTheme();

  const tone =
    score >= 7
      ? { arc: theme.colors.success, badge: 'success' as const }
      : score >= 5
        ? { arc: theme.colors.warning, badge: 'warning' as const }
        : { arc: theme.colors.danger, badge: 'danger' as const };

  return (
    <Card padding="xl" style={{ gap: theme.spacing.lg, alignItems: 'center' }}>
      <View style={{ alignSelf: 'stretch' }}>
        <SectionHeader title="Nota de hoje" right={<Badge label={scoreLabel(score)} tone={tone.badge} />} />
      </View>
      <ProgressRing
        ratio={score / 10}
        color={tone.arc}
        label={`Nota de hoje, ${score.toFixed(1)} de 10`}
        centreLabel={score.toFixed(1).replace('.', ',')}
        centreHint="de 10"
        size={148}
      />
      <Text variant="caption" color="muted" align="center">
        A nota compara seu dia com a sua própria média e com a meta. Ela sobe quando você supera o
        que costuma fazer.
      </Text>
    </Card>
  );
}

/**
 * O benchmark anônimo.
 *
 * A barra existe porque "R$ 2,10 contra R$ 1,95" é uma comparação que o olho
 * não faz sozinho com dois números soltos em cantos opostos do cartão.
 */
function BenchmarkCard({ benchmark }: { benchmark: NonNullable<ReturnType<typeof useBenchmark>> }) {
  const theme = useTheme();
  const { comparison } = benchmark;
  const ahead = comparison.difference >= 0;

  return (
    <Card padding="xl" style={{ gap: theme.spacing.lg }}>
      <SectionHeader
        title="Comparação anônima"
        right={
          <Badge
            label={`${ahead ? '+' : ''}${formatPercent(comparison.difference, 1)}`}
            tone={ahead ? 'success' : 'warning'}
          />
        }
      />

      <RatioBar
        legend={false}
        height={10}
        label={`Você: ${formatCents(comparison.userValue)} por km. ${benchmark.scope}: ${formatCents(comparison.peerValue)} por km.`}
        segments={[
          { label: 'você', amount: comparison.userValue, tone: 'brand', display: '' },
          { label: 'eles', amount: comparison.peerValue, tone: 'neutral', display: '' },
        ]}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.md }}>
        <View style={{ gap: 2 }}>
          <Legend colour={theme.colors.brandPrimary} label="Você" />
          <Text variant="moneyMedium" color="brand">
            {formatCents(comparison.userValue)}/km
          </Text>
        </View>

        <View style={{ gap: 2, alignItems: 'flex-end', flexShrink: 1 }}>
          <Legend colour={theme.colors.borderStrong} label={benchmark.scope} />
          <Text variant="moneyMedium">{formatCents(comparison.peerValue)}/km</Text>
        </View>
      </View>

      <Text variant="caption" color="muted">
        Média de {comparison.sampleSize} motoristas. Nenhum dado individual de outra pessoa é
        mostrado aqui.
      </Text>
    </Card>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <View
        style={{ width: 8, height: 8, borderRadius: theme.radius.pill, backgroundColor: colour }}
      />
      <Text variant="caption" color="secondary" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
