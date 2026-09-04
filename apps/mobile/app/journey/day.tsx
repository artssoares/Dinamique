import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { DateOnly } from '@dinamique/types';
import {
  formatCents,
  formatDistanceKm,
  formatDuration,
  parseCents,
  toDateOnly,
} from '@dinamique/utils';
import {
  AmountInput,
  Button,
  Card,
  Chip,
  Field,
  Icon,
  IconButton,
  ListRow,
  Money,
  Screen,
  ScreenHeader,
  SectionHeader,
  Sheet,
  Skeleton,
  StatGrid,
  StatTile,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { JourneyFilmCard } from '@/features/film/JourneyFilmCard';
import { longDateLabel } from '@/features/route/routeDates';
import { useDayJourneys } from '@/features/route/useJourneyRoute';
import {
  useDayEntries,
  type DayExpense,
  type DayJourney,
  type DayRevenue,
} from '@/features/day/useDayEntries';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Um dia do histórico, aberto e editável.
 *
 * O resumo é o principal e aparece sempre; os filmes são o extra e aparecem
 * quando existe trajeto. Foi ao contrário disso primeiro (a tela só abria se
 * houvesse desenho) e o resultado é que tocar num dia comum não levava a lugar
 * nenhum, mesmo com o dia inteiro de dinheiro e horas guardado ali.
 *
 * O que é novo aqui é poder mexer. Até agora o aplicativo só sabia gravar em
 * "hoje": quem esqueceu de lançar a terça-feira ficava com um buraco permanente
 * na semana, e todo número derivado dela, R$/hora, R$/km, a nota, o benchmark,
 * passava a descrever uma semana que não existiu. Agora cada ganho, cada gasto
 * e o tempo e os km do dia podem ser corrigidos ou apagados, e nada some sem
 * confirmação.
 */
export default function JourneyDay() {
  const theme = useTheme();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date?: string }>();

  const today = toDateOnly(new Date());
  const raw = typeof date === 'string' ? date : '';
  // Uma data inválida ou futura na URL abre hoje, em vez de uma tela quebrada.
  const day: DateOnly = DATE_PATTERN.test(raw) && raw <= today ? raw : today;

  const { journeys: filmJourneys, loading: findingJourneys } = useDayJourneys(day);
  const { entries, loading, saveRevenue, saveExpense, saveJourney, remove } = useDayEntries(day);

  const [platforms, setPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [editor, setEditor] = useState<EditorState>(null);

  useEffect(() => {
    void supabase
      .from('platforms')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setPlatforms((data as { id: string; name: string }[] | null) ?? []));

    void supabase
      .from('expense_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCategories((data as { id: string; name: string }[] | null) ?? []));
  }, []);

  const { summary } = entries;

  function confirmDelete(table: 'revenues' | 'expenses' | 'journeys', id: string, what: string) {
    const message = `Apagar ${what}? Isso não pode ser desfeito.`;
    // O Alert do react-native não existe na web, e lá o confirm do navegador é
    // o que a pessoa espera ver.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(message)) void remove(table, id);
      return;
    }
    Alert.alert('Apagar lançamento', message, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => void remove(table, id) },
    ]);
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title={longDateLabel(day)}
          subtitle={day === today ? 'Hoje' : 'Confira e corrija este dia'}
          onBack={() => router.back()}
        />
      }
    >
      {loading ? (
        <>
          <Skeleton height={200} radius={theme.radius['2xl']} />
          <Skeleton height={120} radius={theme.radius['2xl']} />
        </>
      ) : (
        <>
          <Card padding="xl" style={{ gap: theme.spacing.lg }}>
            <Text variant="overline" color="secondary">
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
                  summary.distance > 0 ? formatDistanceKm(summary.distance, 1) : '– sem km informado'
                }
              />
            </View>
          </Card>

          <StatGrid>
            <StatTile
              variant="tinted"
              tone="brand"
              icon="clock"
              label="Ganho por hora"
              value={summary.revenuePerHour === null ? null : formatCents(summary.revenuePerHour)}
              emptyHint="informe o tempo abaixo"
            />
            <StatTile
              variant="tinted"
              tone="brand"
              icon="route"
              label="Ganho por km"
              value={summary.revenuePerKm === null ? null : formatCents(summary.revenuePerKm)}
              emptyHint="informe os km abaixo"
            />
            <StatTile
              variant="tinted"
              tone="accent"
              icon="box"
              label="Corridas e vendas"
              value={summary.tripCount > 0 ? String(summary.tripCount) : null}
              emptyHint="quantidade não informada"
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

          {/* ------------------------------------------------------ ganhos --- */}
          <View style={{ gap: theme.spacing.md }}>
            <SectionHeader title="Ganhos" />
            <Card padding="none" style={{ overflow: 'hidden' }}>
              {entries.revenues.map((revenue, index) => (
                <ListRow
                  key={revenue.id}
                  first={index === 0}
                  icon="wallet"
                  iconTone="success"
                  label={revenue.note ?? revenue.platformName ?? 'Ganho'}
                  description={
                    revenue.tripCount
                      ? `${revenue.tripCount} ${revenue.tripCount === 1 ? 'corrida' : 'corridas'}`
                      : 'quantidade não informada'
                  }
                  value={formatCents(revenue.amount + revenue.tips)}
                  valueTone="success"
                  onPress={() => setEditor({ kind: 'revenue', revenue })}
                  showChevron={false}
                  right={
                    <IconButton
                      icon="trash"
                      label={`Apagar o ganho de ${formatCents(revenue.amount)}`}
                      tone="ghost"
                      size={36}
                      iconSize={17}
                      onPress={() => confirmDelete('revenues', revenue.id, 'este ganho')}
                    />
                  }
                />
              ))}
              <ListRow
                first={entries.revenues.length === 0}
                icon="plus"
                iconTone="success"
                label="Adicionar um ganho"
                description={`Lançado em ${longDateLabel(day)}`}
                onPress={() => setEditor({ kind: 'revenue', revenue: null })}
              />
            </Card>
          </View>

          {/* ------------------------------------------------------ gastos --- */}
          <View style={{ gap: theme.spacing.md }}>
            <SectionHeader title="Gastos" />
            <Card padding="none" style={{ overflow: 'hidden' }}>
              {entries.expenses.map((expense, index) => (
                <ListRow
                  key={expense.id}
                  first={index === 0}
                  icon="receipt"
                  iconTone="danger"
                  label={expense.categoryName}
                  description={expense.isVehicleCost ? 'custo do veículo' : 'custo pessoal'}
                  value={formatCents(expense.amount)}
                  valueTone="danger"
                  onPress={() => setEditor({ kind: 'expense', expense })}
                  showChevron={false}
                  right={
                    <IconButton
                      icon="trash"
                      label={`Apagar o gasto de ${formatCents(expense.amount)}`}
                      tone="ghost"
                      size={36}
                      iconSize={17}
                      onPress={() => confirmDelete('expenses', expense.id, 'este gasto')}
                    />
                  }
                />
              ))}
              <ListRow
                first={entries.expenses.length === 0}
                icon="plus"
                iconTone="danger"
                label="Adicionar um gasto"
                description={`Lançado em ${longDateLabel(day)}`}
                onPress={() => setEditor({ kind: 'expense', expense: null })}
              />
            </Card>
          </View>

          {/* ---------------------------------------------------- jornadas --- */}
          <View style={{ gap: theme.spacing.md }}>
            <SectionHeader title="Tempo e quilometragem" />
            <Card padding="none" style={{ overflow: 'hidden' }}>
              {entries.journeys.map((journey, index) => (
                <ListRow
                  key={journey.id}
                  first={index === 0}
                  icon="clock"
                  iconTone="brand"
                  label={journeyLabel(journey)}
                  description={
                    journey.status === 'completed'
                      ? journeyDistanceLabel(journey)
                      : 'jornada ainda em andamento'
                  }
                  onPress={
                    journey.status === 'completed'
                      ? () => setEditor({ kind: 'journey', journey })
                      : undefined
                  }
                  showChevron={false}
                  right={
                    <IconButton
                      icon="trash"
                      label="Apagar esta jornada"
                      tone="ghost"
                      size={36}
                      iconSize={17}
                      onPress={() => confirmDelete('journeys', journey.id, 'esta jornada')}
                    />
                  }
                />
              ))}
              <ListRow
                first={entries.journeys.length === 0}
                icon="plus"
                iconTone="brand"
                label="Informar tempo e km deste dia"
                description="Quantas horas você rodou e quantos km fez"
                onPress={() => setEditor({ kind: 'journey', journey: null })}
              />
            </Card>
            <Text variant="caption" color="muted">
              Sem tempo não há R$ por hora, e sem km não há R$ por km. O Dinamique prefere mostrar
              um traço a inventar um número.
            </Text>
          </View>
        </>
      )}

      {/* ------------------------------------------------------------ filme --- */}
      {findingJourneys ? (
        <Skeleton height={480} radius={theme.radius['2xl']} />
      ) : filmJourneys.length > 0 ? (
        filmJourneys.map((journey, index) => (
          <JourneyFilmCard
            key={journey.id}
            journeyId={journey.id}
            label={filmJourneys.length > 1 ? `FILME DA ${index + 1}ª JORNADA` : 'FILME DO DIA'}
          />
        ))
      ) : !entries.isEmpty ? (
        // Uma linha, não uma tela vazia: o dia tem conteúdo, só não tem
        // desenho. Quem nunca ligou o GPS não precisa de um cartaz sobre isso.
        <Text variant="caption" color="muted">
          Sem trajeto neste dia. Fazemos o filme dos dias em que a contagem por GPS estava ligada.
        </Text>
      ) : null}

      <EntryEditor
        state={editor}
        date={day}
        platforms={platforms}
        categories={categories}
        onClose={() => setEditor(null)}
        onSaveRevenue={saveRevenue}
        onSaveExpense={saveExpense}
        onSaveJourney={saveJourney}
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

// ---------------------------------------------------------------- editor ---

type EditorState =
  | null
  | { kind: 'revenue'; revenue: DayRevenue | null }
  | { kind: 'expense'; expense: DayExpense | null }
  | { kind: 'journey'; journey: DayJourney | null };

/**
 * O mesmo formulário para criar e para corrigir.
 *
 * São dois casos da mesma pergunta ("quanto foi?"), e mantê-los na mesma folha
 * é o que garante que corrigir seja tão rápido quanto criar. O motivo de
 * alguém desistir de acertar a semana é a fricção, não a intenção.
 */
function EntryEditor({
  state,
  date,
  platforms,
  categories,
  onClose,
  onSaveRevenue,
  onSaveExpense,
  onSaveJourney,
}: {
  state: EditorState;
  date: DateOnly;
  platforms: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  onClose: () => void;
  onSaveRevenue: (input: {
    id?: string;
    amount: number;
    tripCount: number | null;
    platformId: string | null;
  }) => Promise<void>;
  onSaveExpense: (input: { id?: string; amount: number; categoryId: string }) => Promise<void>;
  onSaveJourney: (input: {
    id?: string;
    workedSeconds: number;
    distance: number | null;
  }) => Promise<void>;
}) {
  const theme = useTheme();
  const [amount, setAmount] = useState('');
  const [trips, setTrips] = useState('');
  const [platformId, setPlatformId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [km, setKm] = useState('');
  const [saving, setSaving] = useState(false);

  // Abrir a folha noutro lançamento tem que trazer os valores daquele
  // lançamento, não os do anterior.
  useEffect(() => {
    if (!state) return;
    if (state.kind === 'revenue') {
      const revenue = state.revenue;
      setAmount(revenue ? formatCents(revenue.amount + revenue.tips, { withSymbol: false }) : '');
      setTrips(revenue?.tripCount ? String(revenue.tripCount) : '');
      setPlatformId(revenue?.platformId ?? null);
    } else if (state.kind === 'expense') {
      setAmount(state.expense ? formatCents(state.expense.amount, { withSymbol: false }) : '');
      setCategoryId(state.expense?.categoryId ?? null);
    } else {
      const worked = state.journey ? workedSecondsOf(state.journey) : 0;
      setHours(worked > 0 ? String(Math.floor(worked / 3600)) : '');
      setMinutes(worked > 0 ? String(Math.round((worked % 3600) / 60)) : '');
      const distance = state.journey?.distanceOverride ?? null;
      setKm(distance ? String(distance / 1000) : '');
    }
  }, [state]);

  const cents = useMemo(() => parseCents(amount), [amount]);
  const workedSeconds =
    Math.max(0, Number(hours || 0)) * 3600 + Math.max(0, Number(minutes || 0)) * 60;

  if (!state) return null;

  const isEdit =
    (state.kind === 'revenue' && state.revenue !== null) ||
    (state.kind === 'expense' && state.expense !== null) ||
    (state.kind === 'journey' && state.journey !== null);

  const canSave =
    state.kind === 'journey'
      ? workedSeconds > 0 || km.trim() !== ''
      : cents !== null && cents > 0 && (state.kind === 'revenue' || categoryId !== null);

  async function handleSave() {
    if (!state) return;
    setSaving(true);
    try {
      if (state.kind === 'revenue' && cents !== null) {
        await onSaveRevenue({
          id: state.revenue?.id,
          amount: cents,
          tripCount: trips.trim() === '' ? null : Number(trips),
          platformId,
        });
      } else if (state.kind === 'expense' && cents !== null && categoryId) {
        await onSaveExpense({ id: state.expense?.id, amount: cents, categoryId });
      } else if (state.kind === 'journey') {
        const metres = km.trim() === '' ? null : Math.round(Number(km) * 1000);
        await onSaveJourney({
          id: state.journey?.id,
          workedSeconds,
          distance: metres !== null && Number.isFinite(metres) && metres > 0 ? metres : null,
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const titles = {
    revenue: isEdit ? 'Corrigir ganho' : 'Novo ganho',
    expense: isEdit ? 'Corrigir gasto' : 'Novo gasto',
    journey: isEdit ? 'Corrigir tempo e km' : 'Tempo e km do dia',
  } as const;

  return (
    <Sheet
      visible
      onClose={onClose}
      title={titles[state.kind]}
      description={`Em ${longDateLabel(date)}`}
      footer={
        <Button
          label="Salvar"
          size="lg"
          fullWidth
          iconName="check"
          loading={saving}
          disabled={!canSave}
          onPress={handleSave}
        />
      }
    >
      <View style={{ gap: theme.spacing.xl }}>
        {state.kind === 'journey' ? (
          <>
            <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Horas"
                  value={hours}
                  onChangeText={setHours}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Minutos"
                  value={minutes}
                  onChangeText={setMinutes}
                  keyboardType="number-pad"
                  placeholder="0"
                />
              </View>
            </View>
            <Field
              label="Quilômetros rodados"
              optional
              iconName="route"
              value={km}
              onChangeText={setKm}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Icon name="info" size={16} color={theme.colors.textMuted} />
              <Text variant="caption" color="muted" style={{ flex: 1 }}>
                {workedSeconds > 0
                  ? `${formatDuration(workedSeconds)} trabalhados neste dia.`
                  : 'Informe o tempo para o aplicativo calcular quanto você ganhou por hora.'}
              </Text>
            </View>
          </>
        ) : (
          <>
            <AmountInput
              label={state.kind === 'revenue' ? 'Quanto entrou' : 'Quanto saiu'}
              value={amount}
              onChangeText={setAmount}
            />

            {state.kind === 'revenue' ? (
              <>
                <View style={{ gap: theme.spacing.sm }}>
                  <Text variant="captionStrong" color="secondary">
                    DE QUAL APLICATIVO?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                    {platforms.map((platform) => (
                      <Chip
                        key={platform.id}
                        label={platform.name}
                        selected={platformId === platform.id}
                        onPress={() =>
                          setPlatformId(platformId === platform.id ? null : platform.id)
                        }
                      />
                    ))}
                  </View>
                </View>
                <Field
                  label="Corridas, entregas ou vendas"
                  optional
                  iconName="box"
                  placeholder="Quantas foram?"
                  keyboardType="number-pad"
                  value={trips}
                  onChangeText={setTrips}
                />
              </>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <Text variant="captionStrong" color="secondary">
                  COM O QUE FOI?
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                  {categories.map((category) => (
                    <Chip
                      key={category.id}
                      label={category.name}
                      selected={categoryId === category.id}
                      onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
                    />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </View>
    </Sheet>
  );
}

// --------------------------------------------------------------- helpers ---

function workedSecondsOf(journey: DayJourney): number {
  if (!journey.endedAt) return 0;
  const elapsed = Math.floor((Date.parse(journey.endedAt) - Date.parse(journey.startedAt)) / 1000);
  return Math.max(0, elapsed - journey.pausedSeconds);
}

function journeyLabel(journey: DayJourney): string {
  const worked = workedSecondsOf(journey);
  return worked > 0 ? formatDuration(worked) : 'sem tempo registrado';
}

function journeyDistanceLabel(journey: DayJourney): string {
  const distance =
    journey.distanceOverride ??
    journey.distanceGps ??
    (journey.odometerEnd !== null &&
    journey.odometerStart !== null &&
    journey.odometerEnd > journey.odometerStart
      ? journey.odometerEnd - journey.odometerStart
      : null);

  return distance ? `${formatDistanceKm(distance)} rodados` : 'sem km informado';
}
