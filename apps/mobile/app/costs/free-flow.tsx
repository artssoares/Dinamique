import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FreeFlowStatus } from '@dinamique/types';
import { addDays, formatCents, parseCents, toDateOnly } from '@dinamique/utils';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Screen,
  ScreenHeader,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

interface FreeFlowRow {
  id: string;
  operator: string;
  passed_at: string;
  amount: number | null;
  due_date: string | null;
  status: FreeFlowStatus;
  remind_at: string | null;
}

const STATUS_LABELS: Record<FreeFlowStatus, string> = {
  to_check: 'Verificar',
  pending: 'Pendente',
  paid: 'Pago',
};

const REMINDERS = [
  { label: 'Amanhã', days: 1 },
  { label: 'Em 3 dias', days: 3 },
  { label: 'Em 7 dias', days: 7 },
];

/**
 * Free Flow (§50). Registro manual, sem GPS.
 *
 * A tela nunca afirma que existe uma cobrança – o Dinamique não consulta
 * concessionária nenhuma. Ela serve para o motorista não esquecer de conferir.
 */
export default function FreeFlow() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();

  const [records, setRecords] = useState<FreeFlowRow[]>([]);
  const [adding, setAdding] = useState(false);

  const [operator, setOperator] = useState('');
  const [amount, setAmount] = useState('');
  const [reminderDays, setReminderDays] = useState<number | null>(3);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('free_flow_records')
      .select('id, operator, passed_at, amount, due_date, status, remind_at')
      .eq('user_id', session.user.id)
      .order('passed_at', { ascending: false });
    setRecords((data as FreeFlowRow[] | null) ?? []);
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!session?.user || operator.trim() === '') return;
    setSaving(true);

    const today = toDateOnly(new Date());
    await supabase.from('free_flow_records').insert({
      user_id: session.user.id,
      operator: operator.trim(),
      passed_at: today,
      amount: parseCents(amount),
      remind_at:
        reminderDays === null
          ? null
          : new Date(`${addDays(today, reminderDays)}T09:00:00`).toISOString(),
    });

    setSaving(false);
    setAdding(false);
    setOperator('');
    setAmount('');
    await load();
  }

  async function setStatus(record: FreeFlowRow, status: FreeFlowStatus) {
    await supabase
      .from('free_flow_records')
      .update({ status, remind_at: status === 'paid' ? null : record.remind_at })
      .eq('id', record.id);
    await load();
  }

  const toCheck = records.filter((record) => record.status !== 'paid').length;

  return (
    <Screen
      header={
        <ScreenHeader
          title="Free Flow"
          subtitle="Pedágio sem cancela"
          onBack={() => router.back()}
        />
      }
      gap="lg"
    >
        <Text variant="body" color="secondary">
          Passou por um pedágio sem cancela? Registre aqui e o Dinamique lembra você de conferir o
          pagamento. Não consultamos a concessionária, quem confere é você.
        </Text>

        {toCheck > 0 ? (
          <Card padding="lg">
            <Text variant="bodyStrong">
              {toCheck} {toCheck === 1 ? 'passagem para conferir' : 'passagens para conferir'}
            </Text>
          </Card>
        ) : null}

        {records.length === 0 && !adding ? (
          <EmptyState
            title="Nenhuma passagem registrada"
            description="Registre quando passar por um pedágio de fluxo livre."
            actionLabel="Registrar passagem"
            onAction={() => setAdding(true)}
          />
        ) : null}

        {adding ? (
          <Card padding="xl" style={{ gap: theme.spacing.lg }}>
            <Field
              label="Concessionária ou local"
              value={operator}
              onChangeText={setOperator}
              placeholder="Ex.: Rodovia dos Bandeirantes"
            />
            <Field
              label="Valor"
              optional
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="R$ 0,00"
            />
            <View style={{ gap: theme.spacing.sm }}>
              <Text variant="captionStrong" color="secondary">
                LEMBRAR DE CONFERIR
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {REMINDERS.map((reminder) => (
                  <Chip
                    key={reminder.days}
                    label={reminder.label}
                    selected={reminderDays === reminder.days}
                    onPress={() => setReminderDays(reminder.days)}
                  />
                ))}
                <Chip
                  label="Não lembrar"
                  selected={reminderDays === null}
                  onPress={() => setReminderDays(null)}
                />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Button label="Salvar" loading={saving} disabled={operator.trim() === ''} onPress={save} />
              <Button label="Cancelar" variant="ghost" onPress={() => setAdding(false)} />
            </View>
          </Card>
        ) : records.length > 0 ? (
          <Button label="Registrar passagem" fullWidth onPress={() => setAdding(true)} />
        ) : null}

        {records.map((record) => (
          <Card key={record.id} padding="lg" style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {record.operator}
              </Text>
              {record.amount ? <Text variant="bodyStrong">{formatCents(record.amount)}</Text> : null}
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              <Badge
                label={STATUS_LABELS[record.status]}
                tone={record.status === 'paid' ? 'success' : record.status === 'pending' ? 'warning' : 'neutral'}
              />
              <Badge label={new Date(`${record.passed_at}T00:00:00`).toLocaleDateString('pt-BR')} />
            </View>

            {record.status !== 'paid' ? (
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <Chip label="Já paguei" onPress={() => setStatus(record, 'paid')} />
                {record.status === 'to_check' ? (
                  <Chip label="Está pendente" onPress={() => setStatus(record, 'pending')} />
                ) : null}
              </View>
            ) : null}
          </Card>
        ))}
    </Screen>
  );
}
