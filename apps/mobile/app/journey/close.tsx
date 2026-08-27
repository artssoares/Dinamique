import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { summarisePeriod, type TrackSummary } from '@dinamique/business-logic';
import {
  encodePolyline,
  formatCents,
  formatDistanceKm,
  formatDuration,
  metresToKm,
  parseCents,
  parseKmToMetres,
  POLYLINE_PRECISION,
  toDateOnly,
} from '@dinamique/utils';
import {
  Button,
  Card,
  Chip,
  Field,
  Money,
  Notice,
  Screen,
  ScreenHeader,
  StepProgress,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { toFriendlyError } from '@/lib/errors';
import { useSession } from '@/hooks/useSession';
import { useActiveJourney } from '@/features/journey/useJourney';
import { useCostCategories } from '@/features/costs/categories';
import { ProductSalePicker } from '@/features/products/ProductSalePicker';
import { costRows, revenueRows as saleRevenueRows, totalsFor } from '@/features/products/sales';
import { useProducts } from '@/features/products/useProducts';
import { closeRowClientId } from '@/features/journey/closeClientIds';
import { resolveDistanceSource } from '@/features/journey/distanceSource';
import { useJourneyTracking } from '@/features/tracking/useJourneyTracking';
import { useRoutePreferences } from '@/features/tracking/preferences';
import { RouteReplay } from '@/features/route/RouteReplay';
import { useStoryShare } from '@/features/route/useStoryShare';

interface Platform {
  id: string;
  name: string;
}

interface QuickCategory {
  id: string;
  name: string;
}

/** Categorias de gasto que aparecem como atalho no fim da jornada (§52). */
const QUICK_SLUGS = [
  'combustivel',
  'alimentacao',
  'pedagio',
  'estacionamento',
  // A taxa de acesso cobrada em aeroporto, terminal e alguns shoppings de São
  // Paulo. É paga durante a corrida e esquecida na hora de fechar o dia.
  'uber-passe',
];

/**
 * Encerramento de jornada em três passos: quanto entrou por aplicativo, quantos
 * km, faltou algum gasto. Depois o resumo. A meta é fechar em ~30 segundos.
 */
export default function CloseJourney() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile } = useSession();
  const {
    journey,
    finish,
    refresh,
    error: journeyError,
    dismissError,
  } = useActiveJourney();
  const { products, loading: productsLoading } = useProducts();
  const productCategory = useCostCategories(['produtos']);
  // `recover: false` — this screen ends journeys. A recovery here would race
  // its own `finish()` and re-register background location for a shift that
  // just ended.
  const tracking = useJourneyTracking(journey?.id ?? null, { recover: false });
  const {
    preferences,
    known: routePreferencesKnown,
    read: readRoutePreferences,
  } = useRoutePreferences();

  const [step, setStep] = useState(0);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [quickCategories, setQuickCategories] = useState<QuickCategory[]>([]);

  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [trips, setTrips] = useState<Record<string, string>>({});
  const [distance, setDistance] = useState('');
  const [odometerEnd, setOdometerEnd] = useState('');
  const [expenses, setExpenses] = useState<Record<string, string>>({});
  const [units, setUnits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [measured, setMeasured] = useState<TrackSummary | null>(null);
  /**
   * How the drawing ended up. 'pending' until the upload settles, so the
   * "o sinal do GPS falhou" card cannot flash on its way to succeeding.
   */
  const [routeOutcome, setRouteOutcome] = useState<'pending' | 'kept' | 'lost' | 'none'>(
    'pending',
  );
  /**
   * Everything the summary needs about the journey, captured before it closes.
   *
   * `finish()` calls `refresh()`, which nulls `journey` — so a summary reading
   * `journey?.startedAt` sees undefined, falls back to "now", and renders a
   * shift of zero seconds with no odometer.
   */
  const [closed, setClosed] = useState<{
    id: string;
    startedAt: string;
    pausedSeconds: number;
    odometerStart: number | null;
    workedSeconds: number;
    /**
     * The GPS figure as it was *filed*, which is null when consent had been
     * withdrawn. Showing the measured value instead would put km and R$/km on
     * the summary that the history and the exports would never agree with.
     */
    gpsDistance: number | null;
  } | null>(null);

  // The same value as a ref. `save()` awaits the read, but awaiting cannot
  // un-stale a `useState` captured in its own render's closure.
  const measuredRef = useRef<TrackSummary | null>(null);
  const suggestion = useRef<string | null>(null);
  /**
   * The km and odometer fields as they stand right now.
   *
   * `parsed` is a memo over render state, and `writeJourney` runs across
   * awaits inside one render's closure. On a retry that re-seeds the field
   * from a fresh track read, the memo it can see still holds the old number.
   */
  const distanceRef = useRef('');
  const odometerRef = useRef('');
  // `save()` needs the shift the effect below is still reading. Without this
  // it can run first, drop `distance_gps` and the polyline, and then release a
  // buffer it never looked at.
  const reading = useRef<Promise<void> | null>(null);
  /** True once a close has been attempted, so a retry knows to re-read. */
  const attempted = useRef(false);
  // Cleared once the journey is actually closed, so backing out of the
  // wizard can tell the difference between "changed my mind" and "finished".
  const openJourneyId = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    void supabase
      .from('user_platforms')
      .select('platforms(id, name, sort_order)')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        const rows = ((data as { platforms: Platform & { sort_order: number } }[] | null) ?? [])
          .map((row) => row.platforms)
          .filter(Boolean)
          .sort((a, b) => a.sort_order - b.sort_order);
        setPlatforms(rows);
      });

    void supabase
      .from('expense_categories')
      .select('id, name, slug')
      .in('slug', QUICK_SLUGS)
      .then(({ data }) => {
        const rows = (data as (QuickCategory & { slug: string })[] | null) ?? [];
        // Mantém a ordem dos atalhos igual à do spec, não a do banco.
        setQuickCategories(
          QUICK_SLUGS.map((slug) => rows.find((r) => r.slug === slug)).filter(
            (r): r is QuickCategory & { slug: string } => Boolean(r),
          ),
        );
      });
  }, [session?.user?.id]);

  const saleLines = useMemo(
    () => products.map((product) => ({ product, quantity: units[product.id] ?? 0 })),
    [products, units],
  );
  const saleTotals = useMemo(() => totalsFor(saleLines), [saleLines]);
  const sells = Boolean(profile?.sellsProducts) || products.length > 0;

  const totals = useMemo(() => {
    const fares = Object.values(amounts).reduce((acc, value) => acc + (parseCents(value) ?? 0), 0);
    const spent = Object.values(expenses).reduce((acc, value) => acc + (parseCents(value) ?? 0), 0);
    // The goods that left the boot are a cost of the day exactly like fuel is.
    const gross = fares + saleTotals.gross;
    const costs = spent + saleTotals.cost;
    return { gross, costs, profit: gross - costs };
  }, [amounts, expenses, saleTotals]);

  useEffect(() => {
    distanceRef.current = distance;
    odometerRef.current = odometerEnd;
  }, [distance, odometerEnd]);

  /**
   * Stop capture and read the shift, once.
   *
   * This happens when the wizard opens rather than on save: the driver is done
   * driving the moment they tap Encerrar, and every extra fix after that is a
   * walk to the door being counted as work.
   */
  useEffect(() => {
    if (!journey?.id) return;
    let cancelled = false;
    const journeyId = journey.id;

    // Armed before anything is awaited. Arming it after the read meant that
    // backing out while the read was still running left capture stopped with
    // nothing to hand it back — the rest of an open shift going uncounted.
    openJourneyId.current = journeyId;

    reading.current = (async () => {
      try {
        // Stopping comes first and unconditionally. Gating it on the buffer
        // meant that "Apagar meus trajetos" — which clears the active-route
        // key — left the OS feeding location updates after the shift ended.
        const summary = await tracking.finish(journeyId);
        if (cancelled || !summary) return;

        measuredRef.current = summary;
        setMeasured(summary);

        // Seeded once. The driver typing is always the last word — a
        // suggestion that reappeared over their correction would be worse than
        // no suggestion at all.
        if (summary.distance !== null && suggestion.current === null) {
          const km = formatSuggestedKm(summary.distance);
          suggestion.current = km;
          setDistance((current) => (current.trim() === '' ? km : current));
        }
      } catch {
        // Reading the track is the optional half of this screen. If it throws,
        // the driver still has to be able to close their day — so the failure
        // is swallowed here rather than left to reject the promise `save()`
        // awaits, which would have frozen the button and stranded the shift.
      }
    })();

    return () => {
      cancelled = true;
      // Backing out means the driver has not finished after all. Without this
      // the rest of the shift goes uncounted, with nothing on screen to
      // suggest it — the worst kind of failure this feature can have.
      if (openJourneyId.current !== journeyId) return;
      // Read again: someone who switched capture off while the wizard was open
      // has withdrawn consent, and backing out must not quietly resume.
      void readRoutePreferences().then((fresh) => {
        if (fresh?.captureEnabled) void tracking.resume(journeyId);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey?.id]);

  /**
   * Parsed once, read twice.
   *
   * The summary used to re-parse only the km field and pass `odometerStart`
   * and `odometerEnd` as null, so a driver who filled in the odometer instead
   * saw "sem km informado" on a journey whose distance was in the database.
   *
   * Through the pt-BR parser, not `Number()`: the phone keyboard offers a
   * comma, and a driver typing the separator their own phone gave them would
   * otherwise watch the kilometres vanish.
   */
  const parsed = useMemo(
    () => ({
      distanceOverride: parseKmToMetres(distance),
      odometerEnd: parseKmToMetres(odometerEnd),
    }),
    [distance, odometerEnd],
  );

  /**
   * Worked time, counting the break the driver is still on.
   *
   * `finish()` banks an open pause into `paused_seconds`, so ignoring
   * `pausedAt` here meant someone who paused for lunch and closed without
   * resuming saw about forty-five minutes more worked time — and a
   * correspondingly better lucro por hora — than the history would show.
   */
  const workedSeconds = journey
    ? Math.max(
        0,
        Math.round((Date.now() - Date.parse(journey.startedAt)) / 1000) -
          journey.pausedSeconds -
          (journey.pausedAt
            ? Math.max(0, Math.round((Date.now() - Date.parse(journey.pausedAt)) / 1000))
            : 0),
      )
    : 0;

  /**
   * The day as the summary screen states it.
   *
   * Computed here rather than inside the `done` branch because the share
   * sheet needs the same figures and a hook cannot live behind a condition.
   * One calculation, so the image and the screen can never disagree about the
   * shift they are both describing.
   */
  const summary = useMemo(
    () =>
      summarisePeriod({
        journeys: [
          {
            id: closed?.id ?? 'x',
            startedAt: closed?.startedAt ?? new Date().toISOString(),
            endedAt: new Date(
              Date.parse(closed?.startedAt ?? new Date().toISOString()) +
                ((closed?.workedSeconds ?? 0) + (closed?.pausedSeconds ?? 0)) * 1000,
            ).toISOString(),
            pausedSeconds: closed?.pausedSeconds ?? 0,
            odometerStart: closed?.odometerStart ?? null,
            odometerEnd: parsed.odometerEnd,
            distanceOverride: parsed.distanceOverride,
            distanceGps: closed?.gpsDistance ?? null,
          },
        ],
        revenues: [
          {
            date: toDateOnly(new Date()),
            amount: totals.gross,
            tips: 0,
            tripCount: null,
            platformId: null,
          },
        ],
        // Two entries, not one: a box of perfume is a cost of the day but not
        // a cost of the vehicle, and lumping it in would inflate the cost per
        // km.
        expenses: [
          {
            date: toDateOnly(new Date()),
            amount: totals.costs - saleTotals.cost,
            isVehicleCost: true,
          },
          { date: toDateOnly(new Date()), amount: saleTotals.cost, isVehicleCost: false },
        ],
      }),
    [closed, parsed, saleTotals.cost, totals.costs, totals.gross],
  );

  const story = useStoryShare({
    points: measured?.points ?? [],
    date: toDateOnly(new Date()),
    distance: summary.distance > 0 ? summary.distance : null,
    workedSeconds: summary.workedSeconds,
    revenuePerKm: summary.revenuePerKm,
  });

  async function save() {
    if (!session?.user || !journey || saving) return;
    setSaving(true);
    setFailure(null);
    dismissError();
    try {
      await writeJourney(session.user.id, journey);
    } catch {
      // Anything that rejects on the way — halting capture, a storage read —
      // used to leave the journey open with nothing said and the button simply
      // re-enabled, which reads as the app ignoring the tap.
      Alert.alert(
        'Não conseguimos encerrar',
        'Sua jornada continua aberta e nada foi perdido. Tente de novo em instantes.',
      );
    } finally {
      // Whatever happened, the driver gets their button back. A stuck spinner
      // on the screen that files the day is the worst outcome available here.
      setSaving(false);
    }
  }

  async function writeJourney(
    userId: string,
    journey: NonNullable<ReturnType<typeof useActiveJourney>['journey']>,
  ) {
    if (attempted.current) {
      // A rejected attempt handed capture back, so the driver may have carried
      // on driving. Re-reading picks up those kilometres — and stops the feed
      // again, which the successful attempt must do or GPS and the Android
      // notification keep running after the journey is filed.
      try {
        const fresh = await tracking.finish(journey.id);
        // Only when there is something new: an empty second read would
        // otherwise throw away a summary we already hold.
        if (fresh) {
          measuredRef.current = fresh;
          setMeasured(fresh);
        }
        if (fresh?.distance != null && suggestion.current !== null) {
          const km = formatSuggestedKm(fresh.distance);
          if (distanceRef.current.trim() === suggestion.current) {
            distanceRef.current = km;
            setDistance(km);
          }
          suggestion.current = km;
        }
      } catch {
        // Same reasoning as the mount read: the money still has to be filed.
      }
    } else {
      // The shift is read once, when the wizard opens. Saving before that
      // lands would file the journey without its distance and then delete the
      // buffer. The read swallows its own errors, so this cannot reject.
      await reading.current;
      // A previous attempt may have handed capture back after being rejected.
      await tracking.halt();
    }
    attempted.current = true;

    const measured = measuredRef.current;
    // From the refs, so a retry saves the numbers now on screen rather than
    // the ones this closure was rendered with.
    const typedKm = distanceRef.current;
    const effective = {
      distanceOverride: parseKmToMetres(typedKm),
      odometerEnd: parseKmToMetres(odometerRef.current),
    };
    const date = toDateOnly(new Date());

    // Tudo é gravado antes de encerrar a jornada, para que nada fique órfão se
    // a conexão cair no meio.
    const revenueRows = platforms
      .map((platform) => ({
        user_id: userId,
        journey_id: journey.id,
        platform_id: platform.id,
        date,
        amount: parseCents(amounts[platform.id] ?? '') ?? 0,
        trip_count: trips[platform.id]?.trim() ? Number(trips[platform.id]) : null,
        client_id: closeRowClientId(journey.id, 'revenue', platform.id),
      }))
      .filter((row) => row.amount > 0);

    // As vendas viram linhas de receita com `product_id`, uma por produto — e
    // ganham um `client_id` derivado do produto pelo mesmo motivo das demais:
    // uma segunda tentativa substitui a primeira em vez de somar-se a ela.
    const productRows = saleLines.flatMap((line) =>
      saleRevenueRows({ userId, journeyId: journey.id, date, lines: [line] }).map((row) => ({
        ...row,
        client_id: closeRowClientId(journey.id, 'revenue', line.product.id),
      })),
    );

    // Um `client_id` por produto, não por categoria: todo custo de produto cai
    // na mesma categoria, e um id por categoria faria três perfumes apagarem
    // uns aos outros. Chamado linha a linha porque `costRows` filtra as que
    // não têm custo, e casar índices depois de um filtro é como se erra isso.
    const productCostRows = saleLines.flatMap((line) =>
      costRows({
        userId,
        journeyId: journey.id,
        date,
        categoryId: productCategory.produtos ?? null,
        lines: [line],
      }).map((row) => ({
        ...row,
        client_id: closeRowClientId(journey.id, 'expense', line.product.id),
      })),
    );

    const expenseRows = quickCategories
      .map((category) => ({
        user_id: userId,
        journey_id: journey.id,
        category_id: category.id,
        date,
        amount: parseCents(expenses[category.id] ?? '') ?? 0,
        client_id: closeRowClientId(journey.id, 'expense', category.id),
      }))
      .filter((row) => row.amount > 0);

    // Every id this close *could* write, not merely the ones it is about to.
    // A retry where the driver blanked an amount would otherwise leave the
    // first attempt's row behind — the history showing more than the summary
    // confirms — and a table cleared entirely would not be touched at all.
    // Os produtos entram na mesma lista: quem tirou uma venda na segunda
    // tentativa precisa vê-la sumir, não ficar.
    const revenueIds = [
      ...platforms.map((p) => closeRowClientId(journey.id, 'revenue', p.id)),
      ...products.map((p) => closeRowClientId(journey.id, 'revenue', p.id)),
    ];
    const expenseIds = [
      ...quickCategories.map((c) => closeRowClientId(journey.id, 'expense', c.id)),
      ...products.map((p) => closeRowClientId(journey.id, 'expense', p.id)),
    ];

    let revenuesLanded = true;
    let expensesLanded = true;
    let revenueError: unknown = null;
    let expenseError: unknown = null;

    if (revenueIds.length > 0) {
      const { error } = await replaceRows('revenues', userId, revenueIds, [
        ...revenueRows,
        ...productRows,
      ]);
      if (error) {
        revenuesLanded = false;
        revenueError = error;
      }
    }

    if (expenseIds.length > 0) {
      const { error } = await replaceRows('expenses', userId, expenseIds, [
        ...expenseRows,
        ...productCostRows,
      ]);
      if (error) {
        expensesLanded = false;
        expenseError = error;
      }
    }

    // The summary is rendered from what is on screen, not from the database.
    // Closing the journey with the money still on the phone would show the
    // driver a day they had, confirm it, and leave nothing behind.
    if (!revenuesLanded || !expensesLanded) {
      setFailure(
        toFriendlyError(revenueError ?? expenseError).message +
          ' Sua jornada continua aberta e nada foi perdido.',
      );
      return;
    }

    // Consent is settled before anything GPS-derived is written. Reading it
    // after `finish()` meant a driver who switched capture off mid-shift still
    // had a measured distance uploaded — the route withheld, the number not.
    //
    // Unknown falls back to the last answer we successfully read, not to "no".
    // Treating a failed query as a refusal dropped the distance, the point
    // count and the polyline permanently, because nothing re-reads a closed
    // journey's buffer. `known` is what distinguishes "we knew a moment ago"
    // from "we have never known"; `loading` cannot, because it goes false on a
    // failed read too.
    const consent = (await readRoutePreferences()) ?? (routePreferencesKnown ? preferences : null);
    const keepRoute = consent?.captureEnabled ?? false;
    const consentKnown = consent !== null;
    const gpsDistance = keepRoute ? (measured?.distance ?? null) : null;
    const gpsPointCount = keepRoute ? (measured?.pointCount ?? null) : null;

    // Cleared before `finish()`, because `finish()` calls `refresh()`, which
    // nulls `journey` and fires this effect's cleanup mid-save. With the
    // marker still set, that cleanup restarts background GPS for the shift
    // being closed and races `beginRoute()` against `clearRoute()`.
    openJourneyId.current = null;

    setClosed({
      id: journey.id,
      startedAt: journey.startedAt,
      pausedSeconds: journey.pausedSeconds,
      odometerStart: journey.odometerStart,
      workedSeconds,
      gpsDistance,
    });

    const distanceSource = resolveDistanceSource({
      distanceOverride: effective.distanceOverride,
      odometerStart: journey.odometerStart,
      odometerEnd: effective.odometerEnd,
      gpsDistance,
      suggested: suggestion.current,
      typed: typedKm,
    });

    const saved = await finish({
      odometerEnd: effective.odometerEnd,
      distanceOverride: effective.distanceOverride,
      distanceGps: gpsDistance,
      routePointCount: gpsPointCount,
      distanceSource,
    });

    if (!saved) {
      // The journey is still open, so backing out means "changed my mind"
      // again. And a journey that did not close did not complete — emitting
      // the event here would put a completion in the warehouse for a shift
      // still running.
      openJourneyId.current = journey.id;
      // Handed back now rather than left to the effect cleanup, and awaited or
      // it can land after the retry's stop.
      await tracking.resume(journey.id);
      Alert.alert(
        'Não conseguimos encerrar',
        'Sua jornada continua aberta e nada foi perdido. Tente de novo em instantes.',
      );
      return;
    }

    // The day is filed. Show it now: `finish()` has already nulled `journey`,
    // so every await between here and the summary renders "Nenhuma jornada em
    // andamento" over the driver's own results.
    setDone(true);

    void track('journey_completed', {
      platforms: revenueRows.length,
      has_distance:
        effective.distanceOverride !== null ||
        effective.odometerEnd !== null ||
        gpsDistance != null,
      distance_source: distanceSource,
    });

    void refresh();

    // Everything below is the route, which is the optional half. It runs after
    // the summary is on screen and it cannot take the summary down with it —
    // the driver's money is filed either way.
    try {
      // One point is a route. A driver who opened and closed a journey
      // without leaving the block still gets to see where they were — the
      // drawing is not the km figure, and only the km figure has a minimum.
      const hasRoute = Boolean(measured && measured.points.length >= 1) && keepRoute;
      if (!hasRoute) setRouteOutcome('none');
      let routeSettled = !hasRoute;

      if (measured && hasRoute) {
        const row = {
          journey_id: journey.id,
          user_id: userId,
          polyline: encodePolyline(measured.points),
          point_count: measured.points.length,
          precision: POLYLINE_PRECISION,
        };

        // Tried twice, here and now. There is no later: nothing re-reads the
        // buffer of a journey that has already closed, so holding it for a
        // retry that does not exist would only leave raw positions on the
        // phone for a week. If both attempts fail the drawing is gone, and the
        // card on the summary says so rather than leaving the driver guessing.
        let { error } = await supabase
          .from('journey_routes')
          .upsert(row, { onConflict: 'journey_id' });
        if (error) {
          ({ error } = await supabase
            .from('journey_routes')
            .upsert(row, { onConflict: 'journey_id' }));
        }

        // Settled either way: there is no third attempt.
        routeSettled = true;
        setRouteOutcome(error ? 'lost' : 'kept');
      }

      // The buffer goes only once the route is settled and we actually know
      // what the driver wanted. Anything else leaves the day on the phone,
      // where it is at worst seven days of clutter — as against deleting a
      // shift somebody drove.
      if (routeSettled && consentKnown) await tracking.release(journey.id);
    } catch {
      // Only if the upload had not already settled. `release()` runs after it
      // and can throw on an unreadable key — overwriting 'kept' would tell the
      // driver the GPS failed about a route sitting in the database.
      setRouteOutcome((current) => (current === 'pending' ? 'lost' : current));
    }
  }

  if (!journey && !done) {
    return (
      <Screen
        header={<ScreenHeader title="Encerrar jornada" onBack={() => router.back()} />}
        center
      >
        <Card padding="xl" style={{ gap: theme.spacing.sm }}>
          <Text variant="subtitle">Nenhuma jornada em andamento</Text>
          <Text variant="body" color="secondary">
            Inicie uma jornada para poder encerrá-la aqui.
          </Text>
        </Card>
      </Screen>
    );
  }

  // ------------------------------------------------------------- resumo ----
  if (done) {
    return (
      <Screen
        header={
          <ScreenHeader
            title="Jornada encerrada"
            subtitle="Veja como foi o seu dia"
            onBack={() => router.replace('/(tabs)')}
          />
        }
      >
          <Card padding="xl" style={{ gap: theme.spacing.lg }}>
            <Text variant="caption" color="secondary">
              LUCRO ESTIMADO DA JORNADA
            </Text>
            <Money value={totals.profit} variant="moneyHero" colorBySign animate />

            <View style={{ gap: theme.spacing.sm }}>
              <Row label="Faturamento" value={formatCents(totals.gross)} />
              <Row label="Custos" value={formatCents(totals.costs)} />
              <Row label="Tempo trabalhado" value={formatDuration(summary.workedSeconds)} />
              {summary.profitPerHour !== null ? (
                <Row label="Lucro por hora" value={formatCents(summary.profitPerHour)} />
              ) : null}
              {summary.revenuePerKm !== null ? (
                <Row label="Faturamento por km" value={formatCents(summary.revenuePerKm)} />
              ) : (
                <Row label="Faturamento por km" value="— sem km informado" />
              )}
            </View>
          </Card>

        {routeOutcome === 'kept' && measured && measured.points.length >= 1 ? (
          <Card padding="lg" style={{ gap: theme.spacing.md }}>
            <Text variant="caption" color="secondary">
              SEU TRAJETO DE HOJE
            </Text>
            {/* Depois do dinheiro, nunca antes. O número é o motivo de o
                motorista abrir esta tela; o desenho é o presente. */}
            <RouteReplay
              points={measured.points}
              distance={summary.distance > 0 ? summary.distance : null}
              onPress={story.open}
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
            {story.sheet}
          </Card>
        ) : null}

        {routeOutcome === 'lost' ? (
          <Card padding="lg">
            <Text variant="caption" color="secondary">
              Não conseguimos desenhar o trajeto de hoje — o sinal do GPS falhou em parte do
              caminho. Seus ganhos e o tempo estão salvos normalmente.
            </Text>
          </Card>
        ) : null}

        <Button
          label="Voltar para o início"
          size="lg"
          fullWidth
          iconName="home"
          onPress={() => router.replace('/(tabs)')}
        />
      </Screen>
    );
  }

  // -------------------------------------------------------------- passos ---
  const steps = [
    {
      title: 'Quanto entrou hoje?',
      subtitle: 'Informe o valor de cada aplicativo que você usou.',
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          {platforms.length === 0 ? (
            <Text variant="caption" color="muted">
              Você ainda não escolheu seus aplicativos. Dá para ajustar isso no seu perfil.
            </Text>
          ) : (
            platforms.map((platform) => (
              <View key={platform.id} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 2 }}>
                  <Field
                    label={platform.name}
                    value={amounts[platform.id] ?? ''}
                    onChangeText={(value) => setAmounts({ ...amounts, [platform.id]: value })}
                    keyboardType="decimal-pad"
                    placeholder="R$ 0,00"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    label="Corridas"
                    optional
                    value={trips[platform.id] ?? ''}
                    onChangeText={(value) => setTrips({ ...trips, [platform.id]: value })}
                    keyboardType="number-pad"
                    placeholder="—"
                  />
                </View>
              </View>
            ))
          )}
        </View>
      ),
    },
    ...(sells
      ? [
          {
            title: 'Vendeu alguma coisa?',
            subtitle: 'Conte quantas unidades saíram. O preço o Dinamique já sabe.',
            content: (
              <ProductSalePicker
                products={products}
                quantities={units}
                loading={productsLoading}
                onChange={(id, quantity) =>
                  setUnits((current) => ({ ...current, [id]: quantity }))
                }
              />
            ),
          },
        ]
      : []),
    {
      title: 'Quantos km você rodou?',
      subtitle:
        measured?.distance != null
          ? 'Já preenchemos com o que medimos. Confira e corrija se estiver diferente.'
          : 'É opcional. Sem km, deixamos de mostrar apenas as contas por quilômetro.',
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          {measured?.distance != null ? (
            <Text variant="caption" color="secondary">
              Contamos {formatDistanceKm(measured.distance, 1)} no seu trajeto de hoje.
            </Text>
          ) : null}
          <Field
            label="Quilômetros rodados"
            optional
            value={distance}
            onChangeText={setDistance}
            keyboardType="decimal-pad"
            placeholder="0"
          />
          <Text variant="caption" color="muted">
            Ou, se preferir, informe o odômetro final:
          </Text>
          <Field
            label="Odômetro final (km)"
            optional
            value={odometerEnd}
            onChangeText={setOdometerEnd}
            keyboardType="number-pad"
          />
        </View>
      ),
    },
    {
      title: 'Faltou algum gasto?',
      subtitle: 'Toque no que você gastou hoje e informe o valor.',
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {quickCategories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                selected={expenses[category.id] !== undefined}
                onPress={() => {
                  const next = { ...expenses };
                  if (next[category.id] !== undefined) delete next[category.id];
                  else next[category.id] = '';
                  setExpenses(next);
                }}
              />
            ))}
          </View>

          {quickCategories
            .filter((category) => expenses[category.id] !== undefined)
            .map((category) => (
              <Field
                key={category.id}
                label={category.name}
                value={expenses[category.id] ?? ''}
                onChangeText={(value) => setExpenses({ ...expenses, [category.id]: value })}
                keyboardType="decimal-pad"
                placeholder="R$ 0,00"
              />
            ))}
        </View>
      ),
    },
  ];

  const current = steps[step]!;
  const isLast = step === steps.length - 1;
  const problem = failure ?? journeyError;

  return (
    <Screen
      header={
        <ScreenHeader
          title="Encerrar jornada"
          onBack={step > 0 ? () => setStep(step - 1) : () => router.back()}
        />
      }
      grow
      footer={
        <Button
          label={isLast ? 'Encerrar jornada' : 'Continuar'}
          size="lg"
          fullWidth
          loading={saving}
          iconName={isLast ? 'check' : 'chevronRight'}
          iconPosition="trailing"
          onPress={() => (isLast ? save() : setStep(step + 1))}
        />
      }
    >
        <StepProgress current={step} total={steps.length} />

        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="titleLg">{current.title}</Text>
          <Text variant="body" color="secondary">
            {current.subtitle}
          </Text>
        </View>

        <View style={{ flex: 1 }}>{current.content}</View>

        {problem !== null ? (
          <Notice
            message={problem}
            onDismiss={() => {
              setFailure(null);
              dismissError();
            }}
          />
        ) : null}

        {totals.gross > 0 ? (
          <Card padding="lg">
            <Text variant="caption" color="secondary">
              Parcial: {formatCents(totals.gross)} faturado
              {saleTotals.units > 0
                ? `, sendo ${formatCents(saleTotals.gross)} em ${saleTotals.units === 1 ? '1 venda' : `${saleTotals.units} vendas`}`
                : ''}
              {totals.costs > 0 ? ` · ${formatCents(totals.costs)} em custos` : ''}
              {` · ${formatDuration(workedSeconds)} trabalhados`}
            </Text>
          </Card>
        ) : null}

    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="captionStrong">{value}</Text>
    </View>
  );
}

/** Written with a comma: what the field shows back, and what the keyboard gives. */
function formatSuggestedKm(metres: number): string {
  return metresToKm(metres).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Writes the close's own rows, replacing whatever a previous attempt left.
 *
 * `clientIds` is every id this close could write, while `rows` is only what it
 * has to say this time — so blanking an amount removes the row a previous
 * attempt left rather than orphaning it. Both are derived from the journey and
 * the platform or category, so nothing the driver entered from the Record tab
 * against the same journey is ever in range.
 *
 * Not an upsert: the unique index is partial (`where client_id is not null`),
 * and Postgres cannot use a partial index as an ON CONFLICT arbiter without
 * its predicate, which PostgREST has no way to send — every close with any
 * revenue would fail outright with 42P10.
 *
 * The delete is scoped by `user_id` as well as by id: RLS already fences it,
 * but the policy admits `is_admin()`.
 */
async function replaceRows(
  table: 'revenues' | 'expenses',
  userId: string,
  clientIds: string[],
  rows: Record<string, unknown>[],
): Promise<{ error: unknown }> {
  const { error: deleteError } = await supabase
    .from(table)
    .delete()
    .eq('user_id', userId)
    .in('client_id', clientIds);

  if (deleteError) return { error: deleteError };
  if (rows.length === 0) return { error: null };
  return supabase.from(table).insert(rows);
}
