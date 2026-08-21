import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FineStatus } from '@dinamique/types';
import { formatCents, parseCents, toDateOnly } from '@dinamique/utils';
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

interface FineRow {
  id: string;
  description: string;
  issued_at: string;
  amount: number;
  due_date: string | null;
  discount_amount: number | null;
  discount_deadline: string | null;
  status: FineStatus;
}

const STATUS_LABELS: Record<FineStatus, string> = {
  pending: 'Pendente',
  paid: 'Paga',
  appealed: 'Contestada',
};

/** Multas (§51). Controle manual – nunca afirmamos que existe um débito. */
export default function Fines() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();

  const [fines, setFines] = useState<FineRow[]>([]);
  const [adding, setAdding] = useState(false);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [discount, setDiscount] = useState('');
  const [discountDeadline, setDiscountDeadline] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('fines')
      .select('id, description, issued_at, amount, due_date, discount_amount, discount_deadline, status')
      .eq('user_id', session.user.id)
      .order('issued_at', { ascending: false });
    setFines((data as FineRow[] | null) ?? []);
  }, [session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!session?.user) return;
    const value = parseCents(amount);
    if (value === null || description.trim() === '') return;

    setSaving(true);
    await supabase.from('fines').insert({
      user_id: session.user.id,
      description: description.trim(),
      issued_at: toDateOnly(new Date()),
      amount: value,
      due_date: dueDate.trim() || null,
      discount_amount: parseCents(discount),
      discount_deadline: discountDeadline.trim() || null,
    });
    setSaving(false);
    setAdding(false);
    setDescription('');
    setAmount('');
    setDueDate('');
    setDiscount('');
    setDiscountDeadline('');
    await load();
  }

  async function setStatus(fine: FineRow, status: FineStatus) {
    await supabase.from('fines').update({ status }).eq('id', fine.id);
    await load();
  }

  const pendingTotal = fines
    .filter((fine) => fine.status === 'pending')
    .reduce((acc, fine) => acc + fine.amount, 0);

  return (
    <Screen
      header={<ScreenHeader title="Multas" onBack={() => router.back()} />}
      gap="lg"
    >
        {pendingTotal > 0 ? (
          <Card padding="xl" style={{ gap: theme.spacing.xs }}>
            <Text variant="caption" color="secondary">
              EM ABERTO
            </Text>
            <Text variant="moneyLarge" color="danger">
              {formatCents(pendingTotal)}
            </Text>
          </Card>
        ) : null}

        {fines.length === 0 && !adding ? (
          <EmptyState
            title="Nenhuma multa registrada"
            description="Registre suas multas aqui para não perder o prazo do desconto."
            actionLabel="Registrar multa"
            onAction={() => setAdding(true)}
          />
        ) : null}

        {adding ? (
          <Card padding="xl" style={{ gap: theme.spacing.lg }}>
            <Field label="Descrição" value={description} onChangeText={setDescription} placeholder="Ex.: velocidade acima da via" />
            <Field label="Valor" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="R$ 0,00" />
            <Field label="Vencimento" optional hint="No formato AAAA-MM-DD." value={dueDate} onChangeText={setDueDate} placeholder="2026-09-15" />
            <Field label="Valor com desconto" optional value={discount} onChangeText={setDiscount} keyboardType="decimal-pad" />
            <Field label="Prazo do desconto" optional value={discountDeadline} onChangeText={setDiscountDeadline} placeholder="2026-09-01" />
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm }}>
              <Button label="Salvar" loading={saving} disabled={description.trim() === '' || !parseCents(amount)} onPress={save} />
              <Button label="Cancelar" variant="ghost" onPress={() => setAdding(false)} />
            </View>
          </Card>
        ) : fines.length > 0 ? (
          <Button label="Registrar multa" fullWidth onPress={() => setAdding(true)} />
        ) : null}

        {fines.map((fine) => (
          <Card key={fine.id} padding="lg" style={{ gap: theme.spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {fine.description}
              </Text>
              <Text variant="bodyStrong">{formatCents(fine.amount)}</Text>
            </View>

            <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
              <Badge
                label={STATUS_LABELS[fine.status]}
                tone={fine.status === 'paid' ? 'success' : fine.status === 'appealed' ? 'warning' : 'danger'}
              />
              {fine.due_date ? (
                <Badge label={`Vence ${new Date(`${fine.due_date}T00:00:00`).toLocaleDateString('pt-BR')}`} />
              ) : null}
            </View>

            {fine.discount_amount && fine.discount_deadline ? (
              <Text variant="caption" color="secondary">
                Com desconto: {formatCents(fine.discount_amount)} até{' '}
                {new Date(`${fine.discount_deadline}T00:00:00`).toLocaleDateString('pt-BR')}.
              </Text>
            ) : null}

            {fine.status === 'pending' ? (
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm }}>
                <Chip label="Marcar como paga" onPress={() => setStatus(fine, 'paid')} />
                <Chip label="Contestei" onPress={() => setStatus(fine, 'appealed')} />
              </View>
            ) : null}
          </Card>
        ))}
    </Screen>
  );
}
