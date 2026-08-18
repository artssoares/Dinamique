import { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDuration, parseCents, toDateOnly } from '@dinamique/utils';
import { Button, Card, Chip, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';
import { addExpense, addRevenue, useActiveJourney } from '@/features/journey/useJourney';

type Mode = 'revenue' | 'expense';

/**
 * The + destination (§26). One screen, two modes, and a running journey
 * summary on top — the goal is a completed entry in well under a minute.
 */
export default function Record() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useSession();
  const { journey, start, pause, resume, finish, refresh } = useActiveJourney();

  const [mode, setMode] = useState<Mode>('revenue');
  const [amount, setAmount] = useState('');
  const [trips, setTrips] = useState('');
  const [platformId, setPlatformId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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

    if (mode === 'revenue') {
      await addRevenue({
        userId: session.user.id,
        journeyId: journey?.id ?? null,
        platformId,
        amount: cents,
        tips: 0,
        tripCount: trips.trim() === '' ? null : Number(trips),
        date,
      });
    } else if (categoryId) {
      await addExpense({
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
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await refresh();
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
      contentContainerStyle={{
        padding: theme.spacing.xl,
        paddingTop: insets.top + theme.spacing.lg,
        gap: theme.spacing.xl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <JourneyCard
        journey={journey}
        onStart={() => start(null)}
        onPause={pause}
        onResume={resume}
        onFinish={() => finish({ odometerEnd: null, distanceOverride: null })}
      />

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Chip label="Ganho" selected={mode === 'revenue'} onPress={() => setMode('revenue')} />
        <Chip label="Gasto" selected={mode === 'expense'} onPress={() => setMode('expense')} />
      </View>

      <Card padding="xl" style={{ gap: theme.spacing.lg }}>
        <Text variant="caption" color="secondary">
          VALOR
        </Text>
        <TextInput
          accessibilityLabel="Valor"
          placeholder="R$ 0,00"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          style={{
            fontSize: 36,
            fontWeight: '700',
            color: theme.colors.textPrimary,
            paddingVertical: theme.spacing.sm,
          }}
        />

        {mode === 'revenue' ? (
          <>
            <Text variant="caption" color="secondary">
              PLATAFORMA
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

            <Text variant="caption" color="secondary">
              CORRIDAS / ENTREGAS (OPCIONAL)
            </Text>
            <TextInput
              accessibilityLabel="Número de corridas ou entregas"
              placeholder="—"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="number-pad"
              value={trips}
              onChangeText={setTrips}
              style={{
                height: 48,
                borderRadius: theme.radius.lg,
                borderWidth: 1,
                borderColor: theme.colors.borderPrimary,
                paddingHorizontal: theme.spacing.lg,
                color: theme.colors.textPrimary,
                fontSize: 16,
              }}
            />
          </>
        ) : (
          <>
            <Text variant="caption" color="secondary">
              CATEGORIA
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
          </>
        )}
      </Card>

      <Button
        label={saved ? 'Salvo' : 'Salvar'}
        size="lg"
        fullWidth
        loading={saving}
        disabled={!canSave}
        onPress={handleSave}
      />
    </ScrollView>
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
        <Text variant="caption" color="secondary">
          Inicie uma jornada para o Dinamique medir seu tempo trabalhado.
        </Text>
        <Button label="Iniciar jornada" onPress={onStart} />
      </Card>
    );
  }

  const elapsed = Math.max(
    0,
    Math.round((now - Date.parse(journey.startedAt)) / 1000) - journey.pausedSeconds,
  );

  return (
    <Card padding="xl" style={{ gap: theme.spacing.md }}>
      <Text variant="caption" color="secondary">
        {journey.status === 'paused' ? 'JORNADA PAUSADA' : 'JORNADA EM ANDAMENTO'}
      </Text>
      <Text variant="moneyLarge">{formatDuration(elapsed)}</Text>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {journey.status === 'active' ? (
          <Button label="Pausar" variant="ghost" size="sm" onPress={onPause} />
        ) : (
          <Button label="Continuar" variant="secondary" size="sm" onPress={onResume} />
        )}
        <Button label="Encerrar" variant="ghost" size="sm" onPress={onFinish} />
      </View>
    </Card>
  );
}
