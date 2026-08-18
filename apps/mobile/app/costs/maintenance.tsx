import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { formatCents, formatDistanceKm, parseCents, toDateOnly } from '@dinamique/utils';
import { Badge, Button, Card, EmptyState, Field, Select, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

interface MaintenanceRow {
  id: string;
  date: string;
  amount: number;
  odometer: number | null;
  next_due_odometer: number | null;
  next_due_date: string | null;
  note: string | null;
  maintenance_types: { name: string } | null;
}

/** Manutenção (§34) com lembrete por km ou por data. */
export default function Maintenance() {
  const theme = useTheme();
  const { session } = useSession();

  const [logs, setLogs] = useState<MaintenanceRow[]>([]);
  const [types, setTypes] = useState<{ id: string; name: string }[]>([]);
  const [adding, setAdding] = useState(false);

  const [typeId, setTypeId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [odometer, setOdometer] = useState('');
  const [nextKm, setNextKm] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('maintenance_logs')
      .select('id, date, amount, odometer, next_due_odometer, next_due_date, note, maintenance_types(name)')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })
      .limit(50);
    setLogs((data as unknown as MaintenanceRow[] | null) ?? []);
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
    void supabase
      .from('maintenance_types')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setTypes((data as { id: string; name: string }[] | null) ?? []));
  }, [load]);

  async function save() {
    if (!session?.user || !typeId) return;
    const value = parseCents(amount);
    if (value === null) return;

    setSaving(true);
    const { data: category } = await supabase
      .from('expense_categories')
      .select('id')
      .eq('slug', 'manutencao')
      .maybeSingle();

    // A manutenção também é despesa: sem isso não entraria no custo por km.
    let expenseId: string | null = null;
    if (category) {
      const { data: expense } = await supabase
        .from('expenses')
        .insert({
          user_id: session.user.id,
          category_id: category.id,
          date: toDateOnly(new Date()),
          amount: value,
        })
        .select('id')
        .single();
      expenseId = (expense?.id as string | undefined) ?? null;
    }

    await supabase.from('maintenance_logs').insert({
      user_id: session.user.id,
      type_id: typeId,
      expense_id: expenseId,
      date: toDateOnly(new Date()),
      amount: value,
      odometer: odometer.trim() === '' ? null : Math.round(Number(odometer) * 1000),
      next_due_odometer: nextKm.trim() === '' ? null : Math.round(Number(nextKm) * 1000),
      next_due_date: nextDate.trim() === '' ? null : nextDate.trim(),
      note: note.trim() || null,
    });

    setSaving(false);
    setAdding(false);
    setTypeId(null);
    setAmount('');
    setOdometer('');
    setNextKm('');
    setNextDate('');
    setNote('');
    await load();
  }

  const upcoming = logs.filter(
    (log) => log.next_due_date !== null && log.next_due_date >= toDateOnly(new Date()),
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Manutenção' }} />
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {upcoming.length > 0 ? (
          <Card padding="lg" style={{ gap: theme.spacing.xs }}>
            <Text variant="captionStrong" color="secondary">
              PRÓXIMAS
            </Text>
            {upcoming.map((log) => (
              <Text key={log.id} variant="caption">
                {log.maintenance_types?.name ?? 'Manutenção'} em{' '}
                {new Date(`${log.next_due_date}T00:00:00`).toLocaleDateString('pt-BR')}
              </Text>
            ))}
          </Card>
        ) : null}

        {logs.length === 0 && !adding ? (
          <EmptyState
            title="Nenhuma manutenção registrada"
            description="Registrando o que você gasta com o veículo, o Dinamique consegue sugerir quanto reservar por dia."
            actionLabel="Registrar manutenção"
            onAction={() => setAdding(true)}
          />
        ) : null}

        {adding ? (
          <Card padding="xl" style={{ gap: theme.spacing.lg }}>
            <Select
              label="Tipo"
              value={typeId}
              options={types.map((t) => ({ value: t.id, label: t.name }))}
              onChange={setTypeId}
            />
            <Field
              label="Valor"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="R$ 0,00"
            />
            <Field
              label="Odômetro (km)"
              optional
              value={odometer}
              onChangeText={setOdometer}
              keyboardType="number-pad"
            />
            <Field
              label="Próxima em (km)"
              optional
              value={nextKm}
              onChangeText={setNextKm}
              keyboardType="number-pad"
            />
            <Field
              label="Próxima em (data)"
              optional
              hint="No formato AAAA-MM-DD."
              value={nextDate}
              onChangeText={setNextDate}
              placeholder="2026-12-01"
            />
            <Field label="Observação" optional value={note} onChangeText={setNote} />
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Button label="Salvar" loading={saving} disabled={!typeId || !parseCents(amount)} onPress={save} />
              <Button label="Cancelar" variant="ghost" onPress={() => setAdding(false)} />
            </View>
          </Card>
        ) : logs.length > 0 ? (
          <Button label="Registrar manutenção" fullWidth onPress={() => setAdding(true)} />
        ) : null}

        {logs.map((log) => (
          <Card key={log.id} padding="lg" style={{ gap: theme.spacing.xs }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyStrong">{log.maintenance_types?.name ?? 'Manutenção'}</Text>
              <Text variant="bodyStrong">{formatCents(log.amount)}</Text>
            </View>
            <Text variant="caption" color="secondary">
              {new Date(`${log.date}T00:00:00`).toLocaleDateString('pt-BR')}
              {log.odometer ? ` · ${formatDistanceKm(log.odometer)}` : ''}
            </Text>
            {log.next_due_odometer ? (
              <Badge label={`Próxima aos ${formatDistanceKm(log.next_due_odometer)}`} />
            ) : null}
            {log.note ? (
              <Text variant="caption" color="muted">
                {log.note}
              </Text>
            ) : null}
          </Card>
        ))}
      </ScrollView>
    </>
  );
}
