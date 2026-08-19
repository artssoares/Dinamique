import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDuration, parseCents, toDateOnly } from '@dinamique/utils';
import {
  AmountInput,
  Button,
  Card,
  Chip,
  Field,
  Icon,
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
import { useSession } from '@/hooks/useSession';
import { addExpense, addRevenue, useActiveJourney } from '@/features/journey/useJourney';
import { useOffline } from '@/features/offline/useOfflineSync';

type Mode = 'revenue' | 'expense';

/**
 * The + destination (§26). One screen, two modes, and a running journey
 * summary on top – the goal is a completed entry in well under a minute.
 */
export default function Record() {
  const theme = useTheme();
  const router = useRouter();
  const reduced = useReducedMotion();
  const { session } = useSession();
  const { save } = useOffline();
  const { journey, start, pause, resume, refresh } = useActiveJourney();

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
  const accent = isExpense ? theme.colors.dangerText : theme.colors.successText;
  const accentSurface = modeShift.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.successSubtle, theme.colors.dangerSubtle],
  });

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
      <Reveal>
        <JourneyCard
          journey={journey}
          onStart={() => start(null)}
          onPause={pause}
          onResume={resume}
          onFinish={() => router.push('/journey/close')}
        />
      </Reveal>

      <SegmentedControl
        label="O que você quer registrar"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'revenue', label: 'Ganho' },
          { value: 'expense', label: 'Gasto' },
        ]}
      />

      <Animated.View
        style={{
          borderRadius: theme.radius['2xl'],
          backgroundColor: theme.colors.surfacePrimary,
          overflow: 'hidden',
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
  onStart,
  onPause,
  onResume,
  onFinish,
}: {
  journey: ReturnType<typeof useActiveJourney>['journey'];
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
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
          Inicie uma jornada para o Dinamique medir seu tempo trabalhado. É o que permite calcular
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
