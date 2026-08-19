import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FuelType } from '@dinamique/types';
import { completeFuelEntry, isFuelEntryComplete } from '@dinamique/business-logic';
import { formatCents, parseCents, toDateOnly } from '@dinamique/utils';
import { Button, Card, Chip, Field, Screen, ScreenHeader, Text, useTheme } from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';

const FUELS: { value: FuelType; label: string }[] = [
  { value: 'gasoline', label: 'Gasolina' },
  { value: 'ethanol', label: 'Etanol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'cng', label: 'GNV' },
  { value: 'electric', label: 'Elétrico' },
];

/**
 * Abastecimento (§30). O usuário digita dois valores e o terceiro aparece
 * sozinho, com aviso de que foi calculado.
 */
export default function Fuel() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();

  const [fuelType, setFuelType] = useState<FuelType>('gasoline');
  const [total, setTotal] = useState('');
  const [price, setPrice] = useState('');
  const [litres, setLitres] = useState('');
  const [odometer, setOdometer] = useState('');
  const [station, setStation] = useState('');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!session?.user) return;
    void supabase
      .from('user_vehicles')
      .select('id')
      .eq('user_id', session.user.id)
      .is('archived_at', null)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setVehicleId((data?.id as string | undefined) ?? null));
  }, [session?.user?.id]);

  const completed = useMemo(() => {
    const parsedLitres = litres.trim() === '' ? null : Math.round(Number(litres.replace(',', '.')) * 1000);
    return completeFuelEntry({
      totalAmount: parseCents(total),
      pricePerLitre: parseCents(price),
      volume: Number.isFinite(parsedLitres) ? parsedLitres : null,
    });
  }, [total, price, litres]);

  async function save() {
    if (!session?.user || !isFuelEntryComplete(completed)) return;
    setSaving(true);
    const date = toDateOnly(new Date());

    // O abastecimento também é uma despesa: sem isso ele não entraria no lucro.
    const { data: category } = await supabase
      .from('expense_categories')
      .select('id')
      .eq('slug', 'combustivel')
      .maybeSingle();

    let expenseId: string | null = null;
    if (category) {
      const { data: expense } = await supabase
        .from('expenses')
        .insert({
          user_id: session.user.id,
          category_id: category.id,
          vehicle_id: vehicleId,
          date,
          amount: completed.totalAmount,
        })
        .select('id')
        .single();
      expenseId = (expense?.id as string | undefined) ?? null;
    }

    const { error } = await supabase.from('fuel_logs').insert({
      user_id: session.user.id,
      vehicle_id: vehicleId,
      expense_id: expenseId,
      date,
      fuel_type: fuelType,
      total_amount: completed.totalAmount,
      price_per_litre: completed.pricePerLitre,
      volume: completed.volume,
      odometer: odometer.trim() === '' ? null : Math.round(Number(odometer) * 1000),
      station: station.trim() || null,
    });

    setSaving(false);

    if (error) {
      Alert.alert('Não conseguimos salvar', 'Tente novamente em instantes.');
      return;
    }
    void track('fuel_added', { fuel_type: fuelType });
    router.back();
  }

  const derivedNote =
    completed.derived === 'volume'
      ? `Calculamos ${((completed.volume ?? 0) / 1000).toFixed(2).replace('.', ',')} litros.`
      : completed.derived === 'pricePerLitre'
        ? `Calculamos ${formatCents(completed.pricePerLitre ?? 0)} por litro.`
        : completed.derived === 'totalAmount'
          ? `Calculamos um total de ${formatCents(completed.totalAmount ?? 0)}.`
          : null;

  return (
    <Screen
      header={<ScreenHeader title="Abastecimento" onBack={() => router.back()} />}
      gap="lg"
    >
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="captionStrong" color="secondary">
            COMBUSTÍVEL
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {FUELS.map((fuel) => (
              <Chip
                key={fuel.value}
                label={fuel.label}
                selected={fuelType === fuel.value}
                onPress={() => setFuelType(fuel.value)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.lg }}>
          <Field
            label="Valor total"
            value={total}
            onChangeText={setTotal}
            keyboardType="decimal-pad"
            placeholder="R$ 0,00"
          />
          <Field
            label="Preço por litro"
            optional
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="5,89"
          />
          <Field
            label="Litros"
            optional
            value={litres}
            onChangeText={setLitres}
            keyboardType="decimal-pad"
            placeholder="30,5"
          />
        </View>

        {derivedNote ? (
          <Card padding="lg" style={{ backgroundColor: theme.colors.brandPrimarySubtle }}>
            <Text variant="caption" color="brand">
              {derivedNote} Preencha dois campos e o terceiro sai sozinho.
            </Text>
          </Card>
        ) : (
          <Text variant="caption" color="muted">
            Preencha dois dos três campos acima e o terceiro é calculado automaticamente.
          </Text>
        )}

        <View style={{ gap: theme.spacing.lg }}>
          <Field
            label="Odômetro (km)"
            optional
            hint="Informar o odômetro permite calcular seu consumo real."
            value={odometer}
            onChangeText={setOdometer}
            keyboardType="number-pad"
          />
          <Field label="Posto" optional value={station} onChangeText={setStation} />
        </View>

        <Button
          label="Salvar abastecimento"
          size="lg"
          fullWidth
          loading={saving}
          disabled={!isFuelEntryComplete(completed)}
          onPress={save}
        />
    </Screen>
  );
}
