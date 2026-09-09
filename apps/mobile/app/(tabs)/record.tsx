import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DateOnly } from '@dinamique/types';
import type { LiveTrackState } from '@dinamique/business-logic';
import {
  addDays,
  formatCents,
  formatDistanceKm,
  formatDuration,
  friendlyDayLabel,
  parseCents,
  toDateOnly,
} from '@dinamique/utils';
import {
  AmountInput,
  Button,
  Card,
  Chip,
  DateField,
  Field,
  Icon,
  Notice,
  Reveal,
  Screen,
  SectionHeader,
  SegmentedControl,
  Text,
  useReducedMotion,
  useTheme,
  type DayMark,
} from '@dinamique/ui';
import { AppHeader } from '@/features/shell/AppHeader';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { toFriendlyError } from '@/lib/errors';
import { useSession } from '@/hooks/useSession';
import { addExpense, addRevenue, useActiveJourney } from '@/features/journey/useJourney';
import { useOffline } from '@/features/offline/useOfflineSync';
import { useJourneyStart } from '@/features/tracking/useJourneyStart';
import { locationService } from '@/features/tracking/locationService';
import { useCostCategories } from '@/features/costs/categories';
import { ProductSalePicker } from '@/features/products/ProductSalePicker';
import { costRows, revenueRows, totalsFor } from '@/features/products/sales';
import { useProducts } from '@/features/products/useProducts';

type Mode = 'revenue' | 'expense' | 'sale';

/**
 * The + destination (§26). One screen, three modes, and a running journey
 * summary on top – the goal is a completed entry in well under a minute.
 *
 * The entry also carries a date. It used to be `toDateOnly(new Date())` with
 * no way to change it, so anything remembered the next morning went onto the
 * wrong day, and a week with a hole in it makes every figure derived from it,
 * R$/hora, R$/km, a nota, o benchmark, a claim about a week that did not
 * happen. The default is still today and stays one tap away.
 */
export default function Record() {
  const theme = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { session, profile } = useSession();
  const { save } = useOffline();
  const {
    journey,
    refresh,
    busy: journeyBusy,
    error: journeyError,
    dismissError,
  } = useActiveJourney();
  const {
    begin: beginJourney,
    pause: pauseJourney,
    resume: resumeJourney,
    tracking,
    sheets: consentSheets,
  } = useJourneyStart();

  const [mode, setMode] = useState<Mode>('revenue');
  const [date, setDate] = useState<DateOnly>(() => toDateOnly(new Date()));
  const [marks, setMarks] = useState<Record<string, DayMark>>({});
  const [amount, setAmount] = useState('');
  const [trips, setTrips] = useState('');
  const [platformId, setPlatformId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // Selling in the car. Offered only to people who said they do it, or who
  // registered a product anyway: an empty third tab is noise for everyone else.
  const { products, loading: productsLoading } = useProducts();
  const [units, setUnits] = useState<Record<string, number>>({});
  const productCategory = useCostCategories(['produtos']);
  const sells = Boolean(profile?.sellsProducts) || products.length > 0;
  const saleLines = products.map((product) => ({ product, quantity: units[product.id] ?? 0 }));
  const saleTotals = totalsFor(saleLines);
  const [saleError, setSaleError] = useState<string | null>(null);

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

  // The dots in the calendar are the point of opening it: "which day did I
  // forget?" is a question you answer by looking, not by remembering.
  const loadMarks = useCallback(async () => {
    if (!session?.user) return;
    const today = toDateOnly(new Date());
    const { data } = await supabase
      .from('daily_totals')
      .select('date, net_profit')
      .eq('user_id', session.user.id)
      .gte('date', addDays(today, -75))
      .lte('date', today);

    const next: Record<string, DayMark> = {};
    for (const row of (data as { date: string; net_profit: number }[] | null) ?? []) {
      next[row.date] = row.net_profit < 0 ? 'negative' : 'positive';
    }
    setMarks(next);
  }, [session?.user?.id]);

  useEffect(() => {
    void loadMarks();
  }, [loadMarks]);

  const isToday = date === toDateOnly(new Date());

  /**
   * A journey belongs to the day it ran on. Attaching today's running journey
   * to a lançamento dated last Tuesday would be a lie about both.
   */
  const journeyForEntry = isToday ? (journey?.id ?? null) : null;

  // 0 is ganho, 1 is gasto. Everything that changes colour between the two
  // reads from this one value, so the whole card shifts together instead of
  // half a dozen elements each deciding for themselves.
  const modeShift = useRef(new Animated.Value(mode === 'expense' ? 1 : 0)).current;

  useEffect(() => {
    const to = mode === 'expense' ? 1 : 0;
    if (reduced) {
      modeShift.setValue(to);
      return;
    }
    const animation = Animated.timing(modeShift, {
      toValue: to,
      duration: theme.motion.base,
      easing: Easing.out(Easing.cubic),
      // Colour interpolation cannot run on the native thread.
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [mode, modeShift, reduced, theme.motion.base]);

  const isExpense = mode === 'expense';
  const isSale = mode === 'sale';
  const accent = isExpense ? theme.colors.dangerText : theme.colors.successText;
  const accentSurface = modeShift.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.successSubtle, theme.colors.dangerSubtle],
  });

  const cents = useMemo(() => parseCents(amount), [amount]);
  const canSave = saving
    ? false
    : isSale
      ? saleTotals.units > 0
      : cents !== null && cents > 0 && (mode === 'revenue' || categoryId !== null);

  async function handleSave() {
    if (!session?.user) return;
    if (isSale) return void handleSaveSale();
    if (cents === null) return;
    setSaving(true);

    let sent = true;

    if (mode === 'revenue') {
      sent = await addRevenue(save, {
        userId: session.user.id,
        journeyId: journeyForEntry,
        platformId,
        amount: cents,
        tips: 0,
        tripCount: trips.trim() === '' ? null : Number(trips),
        date,
      });
    } else if (categoryId) {
      sent = await addExpense(save, {
        userId: session.user.id,
        journeyId: journeyForEntry,
        categoryId,
        amount: cents,
        date,
      });
    }

    setAmount('');
    setTrips('');
    setSaving(false);
    // Sem rede o registro fica guardado; a barra no topo já explica isso, mas
    // o botão precisa dizer a verdade sobre o que aconteceu.
    setSaved(sent ? savedLabel(date) : 'Guardado neste aparelho');
    setTimeout(() => setSaved(null), 2500);
    await refresh();
    await loadMarks();
  }

  /**
   * A sale is written straight to `revenues`, one row per product, rather than
   * through the offline queue: the queue takes one flat record and a basket is
   * several. It is the honest trade for now, and the screen says so if it
   * fails rather than pretending it saved.
   */
  async function handleSaveSale() {
    if (!session?.user || saleTotals.units === 0) return;
    setSaving(true);
    setSaleError(null);
    const userId = session.user.id;
    const journeyId = journeyForEntry;

    const { error: revenueError } = await supabase
      .from('revenues')
      .insert(revenueRows({ userId, journeyId, date, lines: saleLines }));

    if (revenueError) {
      setSaleError(toFriendlyError(revenueError).message);
      setSaving(false);
      return;
    }

    // The goods came out of a box that was paid for. Recording only the
    // takings would call a perfume bought for twenty and sold for fifty a
    // fifty real profit.
    const costs = costRows({
      userId,
      journeyId,
      date,
      categoryId: productCategory.produtos ?? null,
      lines: saleLines,
    });
    if (costs.length > 0) await supabase.from('expenses').insert(costs);

    void track('product_sale_added', { units: saleTotals.units });

    setUnits({});
    setSaving(false);
    setSaved(`${formatCents(saleTotals.gross)} em vendas`);
    setTimeout(() => setSaved(null), 2500);
    await refresh();
    await loadMarks();
  }

  return (
    <Screen
      header={
        <AppHeader
          title="Registrar"
          subtitle={
            sells
              ? 'Lance um ganho, uma venda ou um gasto em segundos'
              : 'Lance um ganho ou um gasto em segundos'
          }
        />
      }
      tabBarSpacing
      footer={
        <Button
          label={saved ?? (isSale ? saleButtonLabel(saleTotals.units) : 'Salvar')}
          size="lg"
          fullWidth
          loading={saving}
          disabled={!canSave}
          iconName={saved ? 'check' : isSale ? 'box' : 'plus'}
          onPress={handleSave}
        />
      }
    >
      <Reveal>
        <JourneyCard
          journey={journey}
          busy={journeyBusy}
          error={journeyError}
          onDismissError={dismissError}
          onStart={() => void beginJourney()}
          onPause={() => void pauseJourney()}
          onResume={() => void resumeJourney()}
          live={tracking.live}
          counting={tracking.tracking}
          foregroundOnly={tracking.tracking && !tracking.background}
          recovered={tracking.recovered}
          onFinish={() => router.push('/journey/close')}
        />
      </Reveal>

      {consentSheets}

      {/* Above the mode switch, because it frames everything under it: what
          you are about to save, and onto which day. */}
      <Card padding="lg">
        <DateField
          label="Em qual dia"
          value={date}
          onChange={setDate}
          marks={marks}
          hint={isToday ? undefined : 'você está lançando em um dia que já passou'}
        />
      </Card>

      <SegmentedControl
        label="O que você quer registrar"
        value={mode}
        onChange={setMode}
        options={
          sells
            ? [
                { value: 'revenue' as Mode, label: 'Corrida' },
                { value: 'sale' as Mode, label: 'Venda' },
                { value: 'expense' as Mode, label: 'Gasto' },
              ]
            : [
                { value: 'revenue' as Mode, label: 'Ganho' },
                { value: 'expense' as Mode, label: 'Gasto' },
              ]
        }
      />

      {/* Vender dentro do carro é dinheiro que não vem do aplicativo, e até
          agora não tinha onde entrar: a única forma de um ganho era "um valor,
          de um aplicativo". Aqui é uma lista do que a pessoa vende, com menos
          e mais, porque a conta o app já sabe fazer. */}
      {isSale ? (
        <Reveal>
          <View style={{ gap: theme.spacing.md }}>
            {saleError ? (
              <Notice message={saleError} onDismiss={() => setSaleError(null)} />
            ) : null}
            <ProductSalePicker
              products={products}
              quantities={units}
              loading={productsLoading}
              onChange={(id, quantity) => setUnits((current) => ({ ...current, [id]: quantity }))}
            />
          </View>
        </Reveal>
      ) : null}

      <Animated.View
        style={{
          borderRadius: theme.radius['2xl'],
          backgroundColor: theme.colors.surfacePrimary,
          overflow: 'hidden',
          display: isSale ? 'none' : 'flex',
        }}
      >
        {/* The mode's colour runs along the top of the card. Subtle, always in
            view, and it moves when you switch, so you never have to re-read
            the control to know what you are about to save. */}
        <Animated.View style={{ height: 4, backgroundColor: accentSurface }} />
        <Animated.View
          style={{ padding: theme.spacing.xl, gap: theme.spacing.xl, backgroundColor: accentSurface }}
        >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <Icon name={isExpense ? 'arrowDownLeft' : 'arrowUpRight'} size={17} color={accent} />
          <Text variant="captionStrong" style={{ color: accent }}>
            {isExpense ? 'Saindo do bolso' : 'Entrando no bolso'}
          </Text>
        </View>

        <AmountInput
          label={isExpense ? 'Quanto saiu' : 'Quanto entrou'}
          value={amount}
          onChangeText={setAmount}
        />

        {!isExpense ? (
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
                    onPress={() => setPlatformId(platformId === platform.id ? null : platform.id)}
                  />
                ))}
              </View>
            </View>

            <Field
              label="Corridas ou entregas"
              optional
              iconName="route"
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
        </Animated.View>
      </Animated.View>

      {!isToday ? (
        <Card
          padding="lg"
          tone="brand"
          onPress={() => router.push({ pathname: '/journey/day', params: { date } })}
          accessibilityLabel={`Abrir ${friendlyDayLabel(date)} inteiro`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
        >
          <Icon name="calendar" size={20} color={theme.colors.brandPrimaryText} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">Ver {friendlyDayLabel(date).toLowerCase()} inteiro</Text>
            <Text variant="caption" color="secondary">
              Confira e corrija tudo que já está lançado nesse dia
            </Text>
          </View>
          <Icon name="chevronRight" size={18} color={theme.colors.textMuted} />
        </Card>
      ) : null}

      <View style={{ gap: theme.spacing.md, display: isSale ? 'none' : 'flex' }}>
        <SectionHeader title="Registros com conta própria" />
        <Card
          padding="lg"
          onPress={() => router.push('/fuel')}
          accessibilityLabel="Registrar abastecimento"
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.warningSubtle,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="fuel" size={20} color={theme.colors.warningText} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">Abastecimento</Text>
            <Text variant="caption" color="secondary">
              Informe litros e preço, o consumo o Dinamique calcula
            </Text>
          </View>
          <Icon name="chevronRight" size={18} color={theme.colors.textMuted} />
        </Card>
      </View>
    </Screen>
  );
}

function JourneyCard({
  journey,
  busy,
  error,
  onDismissError,
  onStart,
  onPause,
  onResume,
  onFinish,
  live,
  counting,
  foregroundOnly,
  recovered,
}: {
  journey: ReturnType<typeof useActiveJourney>['journey'];
  busy: boolean;
  error: string | null;
  onDismissError: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  /** What the counter may claim right now. */
  live?: LiveTrackState;
  /** True while the OS is feeding positions, even before the figure is usable. */
  counting?: boolean;
  /** True when the driver allowed location only while the app is open. */
  foregroundOnly?: boolean;
  /** True when we had to pick the shift back up after a device restart. */
  recovered?: boolean;
}) {
  const theme = useTheme();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (journey?.status !== 'active') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [journey?.status]);

  if (!journey) {
    return (
      <Card padding="xl" style={{ gap: theme.spacing.md, alignItems: 'center' }}>
        <Text variant="subtitle" align="center">
          Nenhuma jornada em andamento
        </Text>
        <Text variant="body" color="secondary" align="center">
          Inicie uma jornada para o Dinamique medir seu tempo trabalhado. É o que permite calcular
          quanto você ganha por hora.
        </Text>
        {error ? (
          <Notice message={error} onDismiss={onDismissError} style={{ alignSelf: 'stretch' }} />
        ) : null}
        <Button label="Iniciar jornada" iconName="play" loading={busy} onPress={onStart} />
      </Card>
    );
  }

  const elapsed = Math.max(
    0,
    Math.round((now - Date.parse(journey.startedAt)) / 1000) - journey.pausedSeconds,
  );

  const paused = journey.status === 'paused';
  // A buffer that has accepted anything is a route in progress, and it stays
  // that way through a pause: `halt()` stops the OS feed and leaves the
  // buffer alone, so "continua de onde parou" is a statement of fact.
  const routeRunning = live !== undefined && live.kind !== 'waiting';
  const counterLine =
    live?.kind === 'counting'
      ? `${formatDistanceKm(live.distance, 1)} contados`
      : live?.kind === 'stationary'
        ? 'Parado no mesmo lugar'
        : live?.kind === 'warming'
          ? 'Contando seus km'
          : 'Procurando o sinal do GPS';

  return (
    // A soft brand tint rather than a dark slab: this card is on screen while
    // someone is driving, and a bright block at night is glare.
    <Card padding="xl" tone="brand" style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: theme.radius.pill,
            backgroundColor:
              journey.status === 'active' ? theme.colors.success : theme.colors.warning,
          }}
        />
        <Text variant="captionStrong" color="secondary">
          {journey.status === 'paused' ? 'Jornada pausada' : 'Jornada em andamento'}
        </Text>
      </View>

      <Text variant="moneyLarge" color="brand">
        {formatDuration(elapsed)}
      </Text>

      {/* One line, and only when there is something true to put in it. A
          driver who declined the permission sees today's card unchanged: no
          banner, no badge, no second invitation.

          Four states, four sentences. This used to be two, because the counter
          answered with a number or a null and null meant three different
          things at once. A driver waiting in the airport queue watched
          "Contando seus km" for forty minutes without a number and had nothing
          on screen telling them the app was fine and the car was simply
          parked. */}
      {paused ? (
        <View style={{ gap: theme.spacing.xxs }}>
          <Text variant="captionStrong" color="secondary">
            {routeRunning ? 'O relógio e o mapa estão parados' : 'O relógio está parado'}
          </Text>
          <Text variant="caption" color="muted">
            {routeRunning
              ? 'Nada é contado durante a pausa. Quando você continuar, o trajeto segue de onde parou, no mesmo mapa.'
              : 'Nada é contado durante a pausa. Quando você continuar, ele volta de onde parou.'}
          </Text>
        </View>
      ) : counting ? (
        <>
          <Text variant="captionStrong" color="secondary">
            {counterLine}
            {foregroundOnly ? ' · só com o app aberto' : ''}
          </Text>
          {live?.kind === 'stationary' ? (
            <Text variant="caption" color="muted">
              O GPS está funcionando, o carro é que não saiu do lugar. O mapa começa a ser
              desenhado assim que você andar.
            </Text>
          ) : null}
        </>
      ) : null}

      {/* No navegador a contagem depende da página estar acordada, e o
          motorista é a única pessoa que pode garantir isso. Uma linha, uma
          vez, enquanto está contando: não é um aviso de erro, é como usar. */}
      {counting && !locationService.supportsBackground ? (
        <Text variant="caption" color="muted">
          Deixe o Dinamique aberto na tela durante a jornada. É assim que o navegador consegue
          seguir o seu caminho até o fim.
        </Text>
      ) : null}

      {recovered ? (
        <Text variant="caption" color="muted">
          O aparelho reiniciou. Voltamos a contar seus km — o trecho desligado pode não ter
          entrado.
        </Text>
      ) : null}

      {error ? <Notice message={error} onDismiss={onDismissError} /> : null}

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm }}>
        {journey.status === 'active' ? (
          <Button
            label="Pausar"
            variant="ghost"
            size="sm"
            iconName="pause"
            loading={busy}
            onPress={onPause}
          />
        ) : (
          <Button
            label="Continuar"
            variant="ghost"
            size="sm"
            iconName="play"
            loading={busy}
            onPress={onResume}
          />
        )}
        <Button label="Encerrar" size="sm" iconName="stop" onPress={onFinish} />
      </View>
    </Card>
  );
}

/**
 * The confirmation names the day when it is not today.
 *
 * "Salvo" is enough for an entry going onto the day the driver is living in.
 * For a backdated one it is not: the whole risk of the feature is money landing
 * on the wrong date and nobody noticing.
 */
function savedLabel(date: string): string {
  return date === toDateOnly(new Date()) ? 'Salvo' : `Salvo em ${friendlyDayLabel(date)}`;
}

/** "Registrar 3 vendas" says what the button will do, "Salvar" does not. */
function saleButtonLabel(units: number): string {
  if (units === 0) return 'Conte o que você vendeu';
  return units === 1 ? 'Registrar 1 venda' : `Registrar ${units} vendas`;
}
