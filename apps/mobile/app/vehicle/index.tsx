import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatConsumption } from '@dinamique/utils';
import { resolveConsumption, shouldSuggestMeasuredConsumption } from '@dinamique/business-logic';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

interface VehicleRow {
  id: string;
  vehicle_type: string;
  custom_label: string | null;
  model_year: number | null;
  fuel_type: string | null;
  ownership: string;
  estimated_consumption: number | null;
  measured_consumption: number | null;
  use_measured_consumption: boolean;
  is_primary: boolean;
  vehicle_versions: {
    name: string | null;
    vehicle_models: { name: string; vehicle_makes: { name: string } | null } | null;
  } | null;
}

const OWNERSHIP_LABELS: Record<string, string> = {
  owned: 'Próprio',
  financed: 'Financiado',
  rented: 'Alugado',
};

/** Lista de veículos do usuário (§32). */
export default function Vehicles() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('user_vehicles')
      .select(
        'id, vehicle_type, custom_label, model_year, fuel_type, ownership, estimated_consumption, ' +
          'measured_consumption, use_measured_consumption, is_primary, ' +
          'vehicle_versions(name, vehicle_models(name, vehicle_makes(name)))',
      )
      .eq('user_id', session.user.id)
      .is('archived_at', null)
      .order('is_primary', { ascending: false });

    setVehicles((data as unknown as VehicleRow[] | null) ?? []);
    setLoading(false);
  }, [session?.user?.id]);

  const header = <ScreenHeader title="Meu veículo" onBack={() => router.back()} />;

  useEffect(() => {
    void load();
  }, [load]);

  async function acceptMeasured(vehicle: VehicleRow) {
    await supabase
      .from('user_vehicles')
      .update({ use_measured_consumption: true })
      .eq('id', vehicle.id);
    await load();
  }

  async function archive(vehicle: VehicleRow) {
    Alert.alert('Remover veículo?', 'Seus lançamentos antigos continuam salvos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          await supabase
            .from('user_vehicles')
            .update({ archived_at: new Date().toISOString(), is_primary: false })
            .eq('id', vehicle.id);
          await load();
        },
      },
    ]);
  }

  // The header renders while loading too: a blank screen has no way back.
  if (loading) {
    return (
      <Screen header={header} gap="lg">
        <Skeleton height={150} radius={theme.radius['2xl']} />
        <Skeleton height={150} radius={theme.radius['2xl']} />
      </Screen>
    );
  }

  return (
    <Screen header={header} gap="lg">
        {vehicles.length === 0 ? (
          <EmptyState
            title="Nenhum veículo cadastrado"
            description="Com o veículo cadastrado o Dinamique calcula seu custo por quilômetro e seu consumo real."
            actionLabel="Cadastrar veículo"
            onAction={() => router.push('/vehicle/new')}
          />
        ) : (
          <>
            {vehicles.map((vehicle) => {
              const consumption = resolveConsumption({
                estimatedConsumption: vehicle.estimated_consumption,
                measuredConsumption: vehicle.measured_consumption,
                useMeasuredConsumption: vehicle.use_measured_consumption,
              });
              const suggest = shouldSuggestMeasuredConsumption({
                estimatedConsumption: vehicle.estimated_consumption,
                measuredConsumption: vehicle.measured_consumption,
                useMeasuredConsumption: vehicle.use_measured_consumption,
              });

              return (
                <Card key={vehicle.id} padding="xl" style={{ gap: theme.spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text variant="subtitle" style={{ flex: 1 }}>
                      {describeVehicle(vehicle)}
                    </Text>
                    {vehicle.is_primary ? <Badge label="Principal" tone="brand" /> : null}
                  </View>

                  <View style={{ flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
                    <Badge label={OWNERSHIP_LABELS[vehicle.ownership] ?? vehicle.ownership} />
                    {vehicle.model_year ? <Badge label={String(vehicle.model_year)} /> : null}
                  </View>

                  {consumption.value !== null ? (
                    <Text variant="caption" color="secondary">
                      Consumo {consumption.source === 'measured' ? 'real medido' : 'estimado'}:{' '}
                      {formatConsumption(consumption.value)}
                    </Text>
                  ) : (
                    <Text variant="caption" color="muted">
                      Consumo ainda não informado.
                    </Text>
                  )}

                  {suggest && vehicle.measured_consumption ? (
                    <Card padding="lg" style={{ backgroundColor: theme.colors.brandPrimarySubtle, gap: theme.spacing.sm }}>
                      <Text variant="captionStrong">
                        Seu consumo real está em {formatConsumption(vehicle.measured_consumption)}.
                      </Text>
                      <Text variant="caption" color="secondary">
                        A estimativa cadastrada é{' '}
                        {vehicle.estimated_consumption
                          ? formatConsumption(vehicle.estimated_consumption)
                          : '—'}
                        . Quer usar o seu consumo real nos cálculos?
                      </Text>
                      <Button
                        label="Usar meu consumo real"
                        size="sm"
                        onPress={() => acceptMeasured(vehicle)}
                      />
                    </Card>
                  ) : null}

                  <Pressable accessibilityRole="button" onPress={() => archive(vehicle)}>
                    <Text variant="caption" color="danger">
                      Remover veículo
                    </Text>
                  </Pressable>
                </Card>
              );
            })}

            <Button
              label="Adicionar outro veículo"
              variant="ghost"
              fullWidth
              onPress={() => router.push('/vehicle/new')}
            />
          </>
        )}
    </Screen>
  );
}

function describeVehicle(vehicle: VehicleRow): string {
  const version = vehicle.vehicle_versions;
  const model = version?.vehicle_models;
  if (model) {
    return [model.vehicle_makes?.name, model.name, version?.name].filter(Boolean).join(' ');
  }
  return vehicle.custom_label ?? 'Veículo';
}
