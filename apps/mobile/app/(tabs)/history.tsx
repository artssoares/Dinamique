import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { GoalPeriod } from '@dinamique/types';
import {
  addDays,
  endOfMonth,
  formatCents,
  formatDistanceKm,
  formatDuration,
  periodRange,
  shortDateLabel,
  startOfMonth,
  toDateOnly,
  weekdayLabel,
} from '@dinamique/utils';
import {
  Button,
  Calendar,
  Card,
  EmptyState,
  Icon,
  Screen,
  SectionHeader,
  SegmentedControl,
  Sheet,
  Skeleton,
  Text,
  useTheme,
  type DayMark,
  type IconName,
} from '@dinamique/ui';
import { AppHeader } from '@/features/shell/AppHeader';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { useRouteDays } from '@/features/route/useJourneyRoute';
import { DAY_ROW_COLUMNS, summariseRows, type DayRow } from '@/features/insights/useSummary';
import { PeriodHeadline, PeriodMetrics } from '@/features/insights/PeriodMetrics';

/**
 * Day-by-day history over a chosen period (§53).
 *
 * The summary at the top used to be six identical white tiles carrying three
 * figures, while the app already kept eleven. It now shows the whole period,
 * grouped and coloured, using the same block Insights uses, so the two screens
 * cannot disagree about what a week was worth.
 *
 * The list underneath is the way into a single day, which is where a forgotten
 * Tuesday gets fixed.
 */
export default function History() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const [period, setPeriod] = useState<GoalPeriod>('weekly');
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(toDateOnly(new Date())));
  const [marks, setMarks] = useState<Record<string, DayMark>>({});

  const load = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    const range = periodRange(period, toDateOnly(new Date()));

    const { data } = await supabase
      .from('daily_totals')
      .select(DAY_ROW_COLUMNS)
      .eq('user_id', session.user.id)
      .gte('date', range.start)
      .lte('date', range.end)
      .order('date', { ascending: false });

    setRows((data as DayRow[] | null) ?? []);
    setLoading(false);
  }, [period, session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Which days already have something, for the month the picker is showing.
   *
   * The calendar reaches further back than the period on screen, so someone on
   * Semana can still jump to a day three months ago. Padded by a week on each
   * side because the grid also shows the tail of the previous month and the
   * head of the next one.
   */
  const loadMarks = useCallback(
    async (month: string) => {
      if (!session?.user) return;
      const { data } = await supabase
        .from('daily_totals')
        .select('date, net_profit')
        .eq('user_id', session.user.id)
        .gte('date', addDays(startOfMonth(month), -7))
        .lte('date', addDays(endOfMonth(month), 7));

      const next: Record<string, DayMark> = {};
      for (const row of (data as { date: string; net_profit: number }[] | null) ?? []) {
        next[row.date] = row.net_profit < 0 ? 'negative' : 'positive';
      }
      setMarks((current) => ({ ...current, ...next }));
    },
    [session?.user?.id],
  );

  useEffect(() => {
    if (pickerOpen) void loadMarks(pickerMonth);
  }, [pickerOpen, pickerMonth, loadMarks]);

  // Which days have a drawing, in one query for the whole period. The glyph
  // only appears where tapping actually leads somewhere: an icon that opens an
  // empty screen is worse than no icon.
  const range = periodRange(period, toDateOnly(new Date()));
  const routeDays = useRouteDays(range.start, range.end);

  const summary = useMemo(() => summariseRows(rows), [rows]);
  const daysWithData = rows.filter(
    (row) => row.gross_revenue > 0 || row.total_expenses > 0 || row.worked_seconds > 0,
  ).length;

  function openDay(date: string) {
    router.push({ pathname: '/journey/day', params: { date } });
  }

  return (
    <Screen
      header={<AppHeader title="Histórico" subtitle="Dia a dia do que você ganhou e gastou" />}
      scroll={false}
      padding="none"
      tabBarSpacing
    >
      <FlatList
        contentContainerStyle={{ gap: theme.spacing.md, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        data={rows}
        keyExtractor={(item) => item.date}
        onRefresh={load}
        refreshing={false}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.lg, marginBottom: theme.spacing.sm }}>
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

            {/* The way into a day that is not in the period on screen. Without
                it, "esqueci de lançar quinta passada" means switching to Mês,
                scrolling, and hoping. */}
            <Button
              label="Abrir um dia anterior"
              variant="secondary"
              iconName="calendar"
              fullWidth
              onPress={() => {
                setPickerMonth(startOfMonth(toDateOnly(new Date())));
                setPickerOpen(true);
              }}
            />

            {rows.length > 0 ? (
              <>
                <PeriodHeadline summary={summary} period={period} />
                <PeriodMetrics summary={summary} daysWithData={daysWithData} />
                <SectionHeader title="Dia a dia" />
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ gap: theme.spacing.md }}>
              <Skeleton height={160} radius={theme.radius['2xl']} />
              <Skeleton height={80} radius={theme.radius['2xl']} />
              <Skeleton height={80} radius={theme.radius['2xl']} />
            </View>
          ) : (
            <EmptyState
              iconName="history"
              title="Nada registrado neste período"
              description="Quando você registrar ganhos ou jornadas, eles aparecem aqui. Também dá para lançar um dia que já passou."
              actionLabel="Abrir um dia"
              onAction={() => setPickerOpen(true)}
            />
          )
        }
        renderItem={({ item }) => (
          <DayCard
            row={item}
            hasRoute={routeDays.has(item.date)}
            onPress={() => openDay(item.date)}
          />
        )}
      />

      <Sheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Qual dia você quer abrir?"
        description="Os dias marcados já têm algo registrado. Toque em qualquer um para conferir e ajustar."
        footer={
          <Button label="Fechar" variant="secondary" fullWidth onPress={() => setPickerOpen(false)} />
        }
      >
        <Calendar
          month={pickerMonth}
          onMonthChange={setPickerMonth}
          marks={marks}
          onSelect={(date) => {
            setPickerOpen(false);
            openDay(date);
          }}
        />
      </Sheet>
    </Screen>
  );
}

/**
 * One day in the list.
 *
 * The stripe down the side carries the sign of the day, so a bad day is
 * visible while scrolling without a figure being read. The facts underneath
 * are icons with numbers rather than a run-on sentence, because the eye finds
 * a receipt faster than it finds the word "custos".
 */
function DayCard({
  row,
  hasRoute,
  onPress,
}: {
  row: DayRow;
  hasRoute: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const negative = row.net_profit < 0;

  return (
    <Card
      padding="none"
      onPress={onPress}
      accessibilityLabel={`Ver ${weekdayLabel(row.date)}, ${shortDateLabel(row.date)}, ${formatCents(row.net_profit)} de lucro`}
      style={{ flexDirection: 'row', overflow: 'hidden' }}
    >
      <View
        style={{ width: 4, backgroundColor: negative ? theme.colors.danger : theme.colors.success }}
      />
      <View style={{ flex: 1, padding: theme.spacing.lg, gap: theme.spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
          >
            <View>
              <Text variant="bodyStrong">{shortDateLabel(row.date)}</Text>
              <Text variant="caption" color="secondary">
                {weekdayLabel(row.date)}
              </Text>
            </View>
            {/* Only on the days that have a route. With the word beside the
                icon: alone it was too small for anyone to work out there was a
                map inside, and the drawing of the road is exactly the part of
                the product nobody was finding. */}
            {hasRoute ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                  paddingVertical: 2,
                  paddingHorizontal: theme.spacing.sm,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.brandPrimarySubtle,
                }}
              >
                <Icon name="route" size={14} color={theme.colors.brandPrimaryText} />
                <Text variant="caption" color="brand">
                  Trajeto
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Text variant="moneyMedium" color={negative ? 'danger' : 'success'}>
              {formatCents(row.net_profit)}
            </Text>
            {/* The chevron is what says the row opens. Without it, a card that
                responds to a touch is a discovery by accident. */}
            <Icon name="chevronRight" size={16} color={theme.colors.textMuted} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }}>
          <Fact
            icon="wallet"
            tone={theme.colors.brandPrimaryText}
            text={formatCents(row.gross_revenue)}
          />
          <Fact
            icon="receipt"
            tone={theme.colors.dangerText}
            text={formatCents(row.total_expenses)}
          />
          {row.worked_seconds > 0 ? (
            <Fact
              icon="clock"
              tone={theme.colors.textSecondary}
              text={formatDuration(row.worked_seconds)}
            />
          ) : null}
          {row.distance > 0 ? (
            <Fact
              icon="route"
              tone={theme.colors.textSecondary}
              text={formatDistanceKm(row.distance)}
            />
          ) : null}
          {row.trip_count > 0 ? (
            <Fact
              icon="box"
              tone={theme.colors.brandSecondaryText}
              text={`${row.trip_count} ${row.trip_count === 1 ? 'corrida' : 'corridas'}`}
            />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function Fact({ icon, tone, text }: { icon: IconName; tone: string; text: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <Icon name={icon} size={14} color={tone} />
      <Text variant="caption" color="secondary">
        {text}
      </Text>
    </View>
  );
}
