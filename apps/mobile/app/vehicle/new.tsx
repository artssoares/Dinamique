import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FuelType, VehicleOwnership, VehicleType } from '@dinamique/types';
import { formatConsumption } from '@dinamique/utils';
import {
  Button,
  Card,
  Chip,
  Field,
  Screen,
  ScreenHeader,
  Select,
  Text,
  useTheme,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';
import { useMakes, useModels, useVersions } from '@/features/vehicle/useVehicleCatalogue';

const TYPES: { value: VehicleType; label: string }[] = [
  { value: 'car', label: 'Carro' },
  { value: 'motorcycle', label: 'Moto' },
  { value: 'bicycle', label: 'Bicicleta' },
  { value: 'electric', label: 'Elétrico' },
];

const OWNERSHIPS: { value: VehicleOwnership; label: string }[] = [
  { value: 'owned', label: 'Próprio' },
  { value: 'financed', label: 'Financiado' },
  { value: 'rented', label: 'Alugado' },
];

const FUELS: { value: FuelType; label: string }[] = [
  { value: 'gasoline', label: 'Gasolina' },
  { value: 'ethanol', label: 'Etanol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'cng', label: 'GNV' },
  { value: 'electric', label: 'Elétrico' },
];

/**
 * Cadastro de veículo (§22 passo 3, §32).
 *
 * O catálogo preenche consumo e combustível sozinho. Se o veículo não estiver
 * lá, o usuário digita o nome e segue – nunca fica travado por falta de dado
 * nosso.
 */
export default function NewVehicle() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useSession();

  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [makeId, setMakeId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState('');
  const [manual, setManual] = useState(false);
  const [year, setYear] = useState('');
  const [fuelType, setFuelType] = useState<FuelType | null>(null);
  const [ownership, setOwnership] = useState<VehicleOwnership>('owned');
  const [saving, setSaving] = useState(false);

  const makes = useMakes(vehicleType);
  const models = useModels(makeId, vehicleType);
  const versions = useVersions(modelId);

  const selectedVersion = versions.find((v) => v.id === versionId) ?? null;

  // Trocar um nível acima invalida os de baixo – sem isso ficaria uma versão
  // de Civic pendurada numa Fiat.
  useEffect(() => {
    setMakeId(null);
    setModelId(null);
    setVersionId(null);
  }, [vehicleType]);

  useEffect(() => {
    setModelId(null);
    setVersionId(null);
  }, [makeId]);

  useEffect(() => {
    setVersionId(null);
  }, [modelId]);

  // O catálogo já sabe combustível e ano: não pedimos de novo (§4).
  useEffect(() => {
    if (selectedVersion) {
      if (selectedVersion.fuelType) setFuelType(selectedVersion.fuelType);
      if (selectedVersion.yearFrom) setYear(String(selectedVersion.yearFrom));
    }
  }, [selectedVersion]);

  const canSave = manual ? customLabel.trim() !== '' : versionId !== null;

  async function save() {
    if (!session?.user) return;
    setSaving(true);

    // O primeiro veículo vira o principal automaticamente.
    const { count } = await supabase
      .from('user_vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .is('archived_at', null);

    const { error } = await supabase.from('user_vehicles').insert({
      user_id: session.user.id,
      vehicle_type: vehicleType,
      version_id: manual ? null : versionId,
      custom_label: manual ? customLabel.trim() : null,
      model_year: year.trim() === '' ? null : Number(year),
      fuel_type: fuelType,
      ownership,
      estimated_consumption: selectedVersion?.urbanConsumption ?? null,
      is_primary: (count ?? 0) === 0,
    });

    setSaving(false);

    if (error) {
      Alert.alert('Não conseguimos salvar', 'Tente novamente em instantes.');
      return;
    }
    void track('vehicle_added', { vehicle_type: vehicleType, from_catalogue: !manual });
    router.back();
  }

  return (
    <Screen
      header={<ScreenHeader title="Cadastrar veículo" onBack={() => router.back()} />}
      gap="lg"
    >
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="captionStrong" color="secondary">
            TIPO
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {TYPES.map((type) => (
              <Chip
                key={type.value}
                label={type.label}
                selected={vehicleType === type.value}
                onPress={() => setVehicleType(type.value)}
              />
            ))}
          </View>
        </View>

        {manual ? (
          <View style={{ gap: theme.spacing.lg }}>
            <Field
              label="Marca e modelo"
              hint="Ex.: Honda Civic EXL 2.0"
              value={customLabel}
              onChangeText={setCustomLabel}
            />
            <Button label="Procurar na lista" variant="ghost" onPress={() => setManual(false)} />
          </View>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <Select
              label="Marca"
              value={makeId}
              options={makes.map((make) => ({ value: make.id, label: make.name }))}
              onChange={setMakeId}
              emptyLabel="Nenhuma marca para este tipo"
            />
            <Select
              label="Modelo"
              value={modelId}
              options={models.map((model) => ({ value: model.id, label: model.name }))}
              onChange={setModelId}
              disabled={!makeId}
              emptyLabel="Escolha a marca primeiro"
            />
            <Select
              label="Versão"
              value={versionId}
              options={versions.map((version) => ({
                value: version.id,
                label: [version.name, version.yearFrom].filter(Boolean).join(' · '),
                hint: version.urbanConsumption
                  ? `Consumo estimado ${formatConsumption(version.urbanConsumption)}`
                  : undefined,
              }))}
              onChange={setVersionId}
              disabled={!modelId}
              emptyLabel="Escolha o modelo primeiro"
            />

            <Button
              label="Não encontrei meu veículo"
              variant="ghost"
              onPress={() => setManual(true)}
            />
          </View>
        )}

        {selectedVersion?.urbanConsumption ? (
          <Card padding="lg">
            <Text variant="caption" color="secondary">
              Vamos começar com o consumo estimado de{' '}
              {formatConsumption(selectedVersion.urbanConsumption)}. Depois de alguns
              abastecimentos, o Dinamique calcula o seu consumo real e pergunta se você quer trocar.
            </Text>
          </Card>
        ) : null}

        <Field
          label="Ano"
          optional
          value={year}
          onChangeText={setYear}
          keyboardType="number-pad"
          maxLength={4}
        />

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
                onPress={() => setFuelType(fuelType === fuel.value ? null : fuel.value)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="captionStrong" color="secondary">
            SITUAÇÃO
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {OWNERSHIPS.map((option) => (
              <Chip
                key={option.value}
                label={option.label}
                selected={ownership === option.value}
                onPress={() => setOwnership(option.value)}
              />
            ))}
          </View>
        </View>

        <Button
          label="Salvar veículo"
          size="lg"
          fullWidth
          loading={saving}
          disabled={!canSave}
          onPress={save}
        />
    </Screen>
  );
}
