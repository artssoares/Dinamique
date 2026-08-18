import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import type { GoalPeriod } from '@dinamique/types';
import { hasFeature } from '@dinamique/business-logic';
import { periodRange, toDateOnly } from '@dinamique/utils';
import { Button, Card, Chip, Field, Text, useTheme } from '@dinamique/ui';
import { useSession } from '@/hooks/useSession';
import { collectExportData } from '@/features/export/collect';
import { exportAndShare, type ExportFormat } from '@/features/export/share';

type Preset = GoalPeriod | 'custom';

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'weekly', label: 'Esta semana' },
  { value: 'monthly', label: 'Este mês' },
  { value: 'yearly', label: 'Este ano' },
  { value: 'custom', label: 'Personalizado' },
];

/** Exportação dos próprios dados (§55, §108). */
export default function Export() {
  const theme = useTheme();
  const { session, plan } = useSession();

  const [preset, setPreset] = useState<Preset>('monthly');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const canExport = hasFeature(plan, 'export_xlsx');

  function resolvePeriod() {
    if (preset === 'custom') {
      return { start: customStart.trim(), end: customEnd.trim() };
    }
    return periodRange(preset, toDateOnly(new Date()));
  }

  async function run(format: ExportFormat) {
    if (!session?.user) return;
    const period = resolvePeriod();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(period.start) || !/^\d{4}-\d{2}-\d{2}$/.test(period.end)) {
      Alert.alert('Datas inválidas', 'Use o formato AAAA-MM-DD nas duas datas.');
      return;
    }
    if (period.start > period.end) {
      Alert.alert('Período invertido', 'A data inicial precisa vir antes da final.');
      return;
    }

    setBusy(format);
    try {
      const data = await collectExportData(session.user.id, period);

      const isEmpty =
        data.daily.length === 0 &&
        data.revenues.length === 0 &&
        data.expenses.length === 0;

      if (isEmpty) {
        Alert.alert('Nada para exportar', 'Não encontramos registros nesse período.');
        return;
      }

      const result = await exportAndShare(session.user.id, data, format);
      if (!result.ok && result.reason) {
        Alert.alert('Não conseguimos compartilhar', result.reason);
      }
    } catch {
      Alert.alert(
        'Não conseguimos gerar o arquivo',
        'Tente um período menor ou tente novamente em instantes.',
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Exportar meus dados' }} />
      <ScrollView
        style={{ backgroundColor: theme.colors.backgroundPrimary }}
        contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="body" color="secondary">
          Gera uma planilha com resumo, jornadas, receitas, despesas, abastecimentos e manutenção do
          período escolhido.
        </Text>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="captionStrong" color="secondary">
            PERÍODO
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {PRESETS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={preset === option.value}
                onPress={() => setPreset(option.value)}
              />
            ))}
          </View>
        </View>

        {preset === 'custom' ? (
          <View style={{ gap: theme.spacing.lg }}>
            <Field
              label="De"
              hint="No formato AAAA-MM-DD."
              value={customStart}
              onChangeText={setCustomStart}
              placeholder="2026-08-01"
            />
            <Field
              label="Até"
              value={customEnd}
              onChangeText={setCustomEnd}
              placeholder="2026-08-31"
            />
          </View>
        ) : null}

        {canExport ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Button
              label="Exportar Excel (XLSX)"
              size="lg"
              fullWidth
              loading={busy === 'xlsx'}
              disabled={busy !== null}
              onPress={() => run('xlsx')}
            />
            <Button
              label="Exportar CSV"
              variant="ghost"
              fullWidth
              loading={busy === 'csv'}
              disabled={busy !== null}
              onPress={() => run('csv')}
            />
          </View>
        ) : (
          <Card padding="xl" style={{ gap: theme.spacing.sm }}>
            <Text variant="bodyStrong">A exportação faz parte do Pro</Text>
            <Text variant="caption" color="secondary">
              Seus dados continuam seus: você pode pedir uma cópia completa a qualquer momento pelo
              suporte, mesmo no plano Free.
            </Text>
          </Card>
        )}
      </ScrollView>
    </>
  );
}
