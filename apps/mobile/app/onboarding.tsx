import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WorkMode } from '@dinamique/types';
import { deriveGoalSuggestions } from '@dinamique/business-logic';
import { formatCents, parseCents } from '@dinamique/utils';
import { Button, Chip, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';

const WORK_MODE_OPTIONS: { value: WorkMode; label: string }[] = [
  { value: 'rideshare', label: 'Motorista de aplicativo' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'taxi', label: 'Táxi' },
  { value: 'private', label: 'Particular' },
];

/**
 * Onboarding is three questions, not a wizard (§22). Anything we can calculate
 * or ask for later is asked for later.
 */
export default function Onboarding() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, refresh } = useSession();

  const [step, setStep] = useState(0);
  const [workModes, setWorkModes] = useState<WorkMode[]>([]);
  const [platformIds, setPlatformIds] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<{ id: string; name: string; work_modes: string[] }[]>([]);
  const [monthlyGoal, setMonthlyGoal] = useState('');
  const [basis, setBasis] = useState<'gross' | 'net'>('gross');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void supabase
      .from('platforms')
      .select('id, name, work_modes')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setPlatforms((data as typeof platforms | null) ?? []));
  }, []);

  const monthlyCents = parseCents(monthlyGoal);
  const suggestions = monthlyCents ? deriveGoalSuggestions(monthlyCents) : null;

  // Only show platforms that match how the driver said they work.
  const relevantPlatforms = platforms.filter(
    (platform) =>
      workModes.length === 0 ||
      platform.work_modes.some((mode) => workModes.includes(mode as WorkMode)),
  );

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function finish() {
    if (!session?.user) return;
    setSaving(true);

    await supabase
      .from('profiles')
      .update({ work_modes: workModes, onboarding_completed_at: new Date().toISOString() })
      .eq('id', session.user.id);

    if (platformIds.length > 0) {
      await supabase
        .from('user_platforms')
        .insert(platformIds.map((id) => ({ user_id: session.user!.id, platform_id: id })));
    }

    if (monthlyCents && suggestions) {
      await supabase.from('goals').insert([
        { user_id: session.user.id, period: 'monthly', basis, target: suggestions.monthly },
        { user_id: session.user.id, period: 'daily', basis, target: suggestions.daily },
      ]);
      void track('goal_created', { period: 'monthly' });
    }

    void track('onboarding_completed', { work_modes: workModes });
    await refresh();
    setSaving(false);
    router.replace('/(tabs)');
  }

  const steps = [
    {
      title: 'Como você trabalha?',
      subtitle: 'Pode escolher mais de uma opção.',
      canAdvance: workModes.length > 0,
      content: (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {WORK_MODE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={workModes.includes(option.value)}
              onPress={() => setWorkModes(toggle(workModes, option.value))}
            />
          ))}
        </View>
      ),
    },
    {
      title: 'Onde você trabalha?',
      subtitle: 'Escolha os aplicativos que você usa hoje.',
      canAdvance: true,
      content: (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {relevantPlatforms.map((platform) => (
            <Chip
              key={platform.id}
              label={platform.name}
              selected={platformIds.includes(platform.id)}
              onPress={() => setPlatformIds(toggle(platformIds, platform.id))}
            />
          ))}
        </View>
      ),
    },
    {
      title: 'Quanto você quer ganhar por mês?',
      subtitle: 'A partir disso o Dinamique monta suas metas diária e mensal.',
      canAdvance: monthlyCents !== null && monthlyCents > 0,
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          <TextInput
            accessibilityLabel="Meta mensal"
            placeholder="R$ 7.000,00"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
            value={monthlyGoal}
            onChangeText={setMonthlyGoal}
            style={{
              fontSize: 32,
              fontWeight: '700',
              color: theme.colors.textPrimary,
              borderBottomWidth: 2,
              borderBottomColor: theme.colors.borderPrimary,
              paddingVertical: theme.spacing.md,
            }}
          />

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Chip label="Faturamento" selected={basis === 'gross'} onPress={() => setBasis('gross')} />
            <Chip label="Lucro líquido" selected={basis === 'net'} onPress={() => setBasis('net')} />
          </View>

          {suggestions ? (
            <Text variant="caption" color="secondary">
              Isso dá cerca de {formatCents(suggestions.daily)} por dia ou{' '}
              {formatCents(suggestions.weekly)} por semana.
            </Text>
          ) : null}
        </View>
      ),
    },
  ];

  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.backgroundPrimary }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: theme.spacing.xl,
        paddingTop: insets.top + theme.spacing['3xl'],
        gap: theme.spacing.xl,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
        {steps.map((_, index) => (
          <View
            key={index}
            style={{
              flex: 1,
              height: 4,
              borderRadius: theme.radius.pill,
              backgroundColor:
                index <= step ? theme.colors.brandPrimary : theme.colors.backgroundSecondary,
            }}
          />
        ))}
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="titleLg">{current.title}</Text>
        <Text variant="body" color="secondary">
          {current.subtitle}
        </Text>
      </View>

      <View style={{ flex: 1 }}>{current.content}</View>

      <View style={{ gap: theme.spacing.sm }}>
        <Button
          label={isLast ? 'Começar' : 'Continuar'}
          size="lg"
          fullWidth
          loading={saving}
          disabled={!current.canAdvance}
          onPress={() => (isLast ? finish() : setStep(step + 1))}
        />
        {step > 0 ? (
          <Button label="Voltar" variant="ghost" fullWidth onPress={() => setStep(step - 1)} />
        ) : null}
      </View>
    </ScrollView>
  );
}
