import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Metres } from '@dinamique/types';
import { formatDistanceKm, formatDuration, parseCents, toDateOnly } from '@dinamique/utils';
import {
  AmountInput,
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Screen,
  SectionHeader,
  SegmentedControl,
  Text,
  useTheme,
} from '@dinamique/ui';
import { AppHeader } from '@/features/shell/AppHeader';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';
import { addExpense, addRevenue, useActiveJourney } from '@/features/journey/useJourney';
import { useJourneyTracking } from '@/features/tracking/useJourneyTracking';
import { useRoutePreferences } from '@/features/tracking/preferences';
import {
  BackgroundConsentSheet,
  RouteConsentSheet,
} from '@/features/tracking/RouteConsentSheet';
import { locationService } from '@/features/tracking/locationService';
import { PERMISSION_COPY } from '@/features/tracking/permission';
import { useOffline } from '@/features/offline/useOfflineSync';

type Mode = 'revenue' | 'expense';

/**
 * The + destination (§26). One screen, two modes, and a running journey
 * summary on top — the goal is a completed entry in well under a minute.
 */
export default function Record() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const { save } = useOffline();
  const { journey, start, pause, resume, refresh } = useActiveJourney();
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
    const id = await start(null);
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

  const cents = useMemo(() => parseCents(amount), [amount]);
  const canSave =
    cents !== null && cents > 0 && (mode === 'revenue' || categoryId !== null) && !saving;

  async function handleSave() {
    if (!session?.user || cents === null) return;
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

  return (
    <Screen
      header={<AppHeader title="Registrar" subtitle="Lance um ganho ou um gasto em segundos" />}
      tabBarSpacing
      footer={
        <Button
          label={saved ?? 'Salvar'}
          size="lg"
          fullWidth
          loading={saving}
          disabled={!canSave}
          iconName={saved ? 'check' : 'plus'}
          onPress={handleSave}
        />
      }
    >
      <JourneyCard
        journey={journey}
        onStart={() => void beginJourney()}
        onPause={() => void pauseJourney()}
        onResume={() => void resumeJourney()}
        liveDistance={tracking.tracking ? tracking.liveDistance : null}
        foregroundOnly={tracking.tracking && !tracking.background}
        recovered={tracking.recovered}
        onFinish={() => router.push('/journey/close')}
      />

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
        options={[
          { value: 'revenue', label: 'Ganho' },
          { value: 'expense', label: 'Gasto' },
        ]}
      />

      <Card padding="xl" style={{ gap: theme.spacing.xl }}>
        <AmountInput
          label={mode === 'revenue' ? 'Quanto entrou' : 'Quanto saiu'}
          value={amount}
          onChangeText={setAmount}
        />

        {mode === 'revenue' ? (
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
      </Card>

      <View style={{ gap: theme.spacing.md }}>
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
              Informe litros e preço — o consumo o Dinamique calcula
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
  onStart,
  onPause,
  onResume,
  onFinish,
  liveDistance,
  foregroundOnly,
  recovered,
}: {
  journey: ReturnType<typeof useActiveJourney>['journey'];
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
      <Card padding="xl" style={{ gap: theme.spacing.md }}>
        <Text variant="subtitle">Nenhuma jornada em andamento</Text>
        <Text variant="body" color="secondary">
          Inicie uma jornada para o Dinamique medir seu tempo trabalhado — é o que permite calcular
          quanto você ganha por hora.
        </Text>
        <Button label="Iniciar jornada" iconName="play" onPress={onStart} />
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

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {journey.status === 'active' ? (
          <Button label="Pausar" variant="ghost" size="sm" iconName="pause" onPress={onPause} />
        ) : (
          <Button label="Continuar" variant="ghost" size="sm" iconName="play" onPress={onResume} />
        )}
        <Button label="Encerrar" size="sm" iconName="stop" onPress={onFinish} />
      </View>
    </Card>
  );
}
