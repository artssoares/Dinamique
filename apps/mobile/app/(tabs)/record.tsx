import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Metres } from '@dinamique/types';
import { formatCents, formatDistanceKm, formatDuration, parseCents, toDateOnly } from '@dinamique/utils';
import {
  AmountInput,
  Button,
  Card,
  Chip,
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
} from '@dinamique/ui';
import { AppHeader } from '@/features/shell/AppHeader';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { toFriendlyError } from '@/lib/errors';
import { useSession } from '@/hooks/useSession';
import { runningJourneyId } from '@/features/journey/runningJourneyId';
import { addExpense, addRevenue, useActiveJourney } from '@/features/journey/useJourney';
import { useOffline } from '@/features/offline/useOfflineSync';
import { useJourneyTracking } from '@/features/tracking/useJourneyTracking';
import { useRoutePreferences } from '@/features/tracking/preferences';
import { BackgroundConsentSheet, RouteConsentSheet } from '@/features/tracking/RouteConsentSheet';
import { locationService } from '@/features/tracking/locationService';
import { PERMISSION_COPY } from '@/features/tracking/permission';
import { useCostCategories } from '@/features/costs/categories';
import { ProductSalePicker } from '@/features/products/ProductSalePicker';
import { costRows, revenueRows, totalsFor } from '@/features/products/sales';
import { useProducts } from '@/features/products/useProducts';

type Mode = 'revenue' | 'expense' | 'sale';

/**
 * The + destination (§26). One screen, two modes, and a running journey
 * summary on top – the goal is a completed entry in well under a minute.
 */
export default function Record() {
  const theme = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { session, profile } = useSession();
  const { save } = useOffline();
  const {
    journey,
    start,
    pause,
    resume,
    refresh,
    busy: journeyBusy,
    error: journeyError,
    dismissError,
  } = useActiveJourney();
  const { read: readRoutePreferences, update: updateRoutePreferences } = useRoutePreferences();
  const tracking = useJourneyTracking(journey?.id ?? null);
  const [askingConsent, setAskingConsent] = useState(false);
  const [askingBackground, setAskingBackground] = useState(false);
  // Held in a ref because the consent sheet resolves after `journey` has been
  // re-read, and the sheet's callbacks close over the render that opened it.
  const journeyIdRef = useRef<string | null>(null);

  /**
   * Starting a journey, with capture attached only when it is wanted.
   *
   * The journey itself always starts. Everything about the GPS is layered on
   * after that and can fail at any step without the driver losing their shift —
   * which is why the sheet is shown after `start()`, not before it.
   */
  async function beginJourney() {
    if (!(await start(null))) return;
    // Read back rather than trusting the provider's state: `start()` awaits
    // its own refresh, but this closure was rendered before either happened.
    const id = await runningJourneyId();
    if (!id) return;
    journeyIdRef.current = id;

    // Read from the database, not from state. On a cold start the hook is
    // still loading, and its defaults say "capture off" — which would show the
    // consent sheet to someone who opted in months ago, and leave them without
    // capture if they tapped "agora não".
    const preferences = await readRoutePreferences();
    // Could not tell. Starting capture the driver may not have asked for is
    // the worse mistake, so we do not — but we say so, because neither
    // recovery path can fix this later: both need an active-route key that
    // only starting capture creates.
    if (!preferences) {
      Alert.alert(
        'Não conseguimos verificar sua preferência',
        'Sua jornada começou normalmente, mas os km não estão sendo contados pelo GPS. Ligue de novo em Mais › Trajeto e privacidade.',
      );
      return;
    }

    if (preferences.captureEnabled) {
      await attachTracking(id);
      return;
    }
    // Asked once. Someone who said no changes their mind in the settings, not
    // by being asked again at the start of every shift.
    if (!preferences.prompted) setAskingConsent(true);
  }

  async function attachTracking(journeyId: string) {
    const outcome = await tracking.begin(journeyId);
    if (!outcome.granted) {
      // The preference was written before the OS dialog, so a refusal has to
      // take it back — a switch reading "on" while nothing is recorded is a
      // lie the driver only discovers at the end of the day.
      //
      // Except when the phone's location is simply switched off. That is not a
      // refusal, and clearing the opt-in there would cost a driver the feature
      // permanently over a toggle in the system settings.
      if (outcome.deniedAt !== 'services_off') {
        await updateRoutePreferences({ captureEnabled: false });
      }
      Alert.alert(
        outcome.deniedAt === 'services_off' ? 'Localização desligada' : 'Sem acesso à localização',
        outcome.deniedAt === 'services_off'
          ? PERMISSION_COPY.servicesOff
          : 'Sem essa permissão o Dinamique não consegue contar seus km. Você pode liberar depois em Mais › Trajeto e privacidade.',
      );
      return;
    }
    // Only now, with the card on screen counting, is "Sempre" a question the
    // driver can actually evaluate — and the one App Store review expects.
    // Asked only if we do not already hold it: re-asking someone who said yes
    // last month is nagging, not consent.
    if (locationService.supportsBackground && !outcome.background) {
      setAskingBackground(true);
    }
  }

  async function declineCapture() {
    setAskingConsent(false);
    await updateRoutePreferences({ prompted: true });
  }

  async function acceptCapture() {
    setAskingConsent(false);
    // Capture only starts if the consent actually reached the server. Starting
    // anyway would record a whole shift against a preference that still reads
    // `false` — and at close that same `false` drops the distance, drops the
    // route, and releases the buffer.
    const saved = await updateRoutePreferences({ captureEnabled: true, prompted: true });
    if (!saved) {
      Alert.alert(
        'Não conseguimos salvar sua escolha',
        'Confira sua conexão e ligue a contagem por GPS em Mais › Trajeto e privacidade.',
      );
      return;
    }
    void track('route_capture_enabled', { source: 'journey_start' });
    if (journeyIdRef.current) await attachTracking(journeyIdRef.current);
  }

  /**
   * Pausing stops the counting as well as the clock.
   *
   * Leaving the feed running through a break put the kilometres driven to
   * lunch into `distance_gps` while the same minutes were excluded from
   * `paused_seconds` — a denominator inflated and a numerator not, which skews
   * every per-km figure the product exists to get right.
   *
   * Halting first, but never at the cost of the pause itself: if the OS
   * refuses to stop the feed, the break still has to be banked, because
   * counting it as worked time is the larger of the two errors.
   */
  async function pauseJourney() {
    await tracking.halt().catch(() => undefined);
    await pause();
  }

  async function resumeJourney() {
    await resume();
    if (journey) await tracking.resume(journey.id).catch(() => undefined);
  }

  const [mode, setMode] = useState<Mode>('revenue');
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
    const date = toDateOnly(new Date());

    let sent = true;

    if (mode === 'revenue') {
      sent = await addRevenue(save, {
        userId: session.user.id,
        journeyId: journey?.id ?? null,
        platformId,
        amount: cents,
        tips: 0,
        tripCount: trips.trim() === '' ? null : Number(trips),
        date,
      });
    } else if (categoryId) {
      sent = await addExpense(save, {
        userId: session.user.id,
        journeyId: journey?.id ?? null,
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
    setSaved(sent ? 'Salvo' : 'Guardado neste aparelho');
    setTimeout(() => setSaved(null), 2500);
    await refresh();
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
    const date = toDateOnly(new Date());
    const userId = session.user.id;
    const journeyId = journey?.id ?? null;

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
          liveDistance={tracking.tracking ? tracking.liveDistance : null}
          foregroundOnly={tracking.tracking && !tracking.background}
          recovered={tracking.recovered}
          onFinish={() => router.push('/journey/close')}
        />
      </Reveal>

      <RouteConsentSheet
        visible={askingConsent}
        onAccept={() => void acceptCapture()}
        onDecline={() => void declineCapture()}
      />

      <BackgroundConsentSheet
        visible={askingBackground}
        onAccept={() => {
          setAskingBackground(false);
          void tracking.askBackground();
        }}
        onDecline={() => setAskingBackground(false)}
      />

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
  liveDistance,
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
  /** Metres counted so far, or null when capture is off or still too thin. */
  liveDistance?: Metres | null;
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
          driver who declined the permission sees today's card unchanged — no
          banner, no badge, no second invitation. */}
      {liveDistance !== null && liveDistance !== undefined ? (
        <Text variant="captionStrong" color="secondary">
          {formatDistanceKm(liveDistance, 1)} contados
          {foregroundOnly ? ' · só com o app aberto' : ''}
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

/** "Registrar 3 vendas" says what the button will do, "Salvar" does not. */
function saleButtonLabel(units: number): string {
  if (units === 0) return 'Conte o que você vendeu';
  return units === 1 ? 'Registrar 1 venda' : `Registrar ${units} vendas`;
}
