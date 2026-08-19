import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { FuelType, VehicleOwnership, VehicleType, WorkMode } from '@dinamique/types';
import { deriveGoalSuggestions } from '@dinamique/business-logic';
import { formatCents, parseCents } from '@dinamique/utils';
import {
  AmountInput,
  Button,
  Card,
  Field,
  Icon,
  OptionCard,
  Screen,
  ScreenHeader,
  Select,
  StepProgress,
  Text,
  useResponsive,
  useTheme,
  type IconName,
} from '@dinamique/ui';
import { supabase } from '@/lib/supabase';
import { applyMonthlyGoal } from '@/features/goals/applyGoals';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';
import { BrandMark } from '@/features/brand/BrandMark';
import { PlatformMark } from '@/features/platforms/PlatformMark';
import { useMakes, useModels } from '@/features/vehicle/useVehicleCatalogue';

const WORK_MODE_OPTIONS: { value: WorkMode; label: string; description: string; icon: IconName }[] = [
  {
    value: 'rideshare',
    label: 'Levo passageiros por aplicativo',
    description: 'Uber, 99 e parecidos',
    icon: 'car',
  },
  {
    value: 'delivery',
    label: 'Faço entregas',
    description: 'Comida, mercado, encomendas',
    icon: 'route',
  },
  { value: 'taxi', label: 'Sou taxista', description: 'Ponto, rádio-táxi ou aplicativo', icon: 'phone' },
  {
    value: 'private',
    label: 'Rodo por conta própria',
    description: 'Clientes fixos, fretes, particular',
    icon: 'wallet',
  },
];

const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

interface StepDefinition {
  key: string;
  title: string;
  subtitle: string;
  content: ReactNode;
  /** False blocks "Continuar" until the question is answered. */
  canAdvance: boolean;
  /** Optional questions can be passed over without answering. */
  skippable?: boolean;
}

/**
 * Onboarding.
 *
 * One question per screen, in the plainest Portuguese we can write: "Como você
 * trabalha?" rather than "modalidade de operação". Splitting it into more, but
 * smaller, steps is what makes it feel shorter – three dense screens read as
 * a form, seven one-question screens read as a conversation, and the count is
 * stated out loud so nobody wonders how much is left.
 *
 * Only the two questions the app cannot work without – how you work and how
 * much you want to earn – are required. Everything else says "pular".
 */
export default function Onboarding() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile, refresh } = useSession();
  const { scale } = useResponsive();

  const [step, setStep] = useState(0);
  const [workModes, setWorkModes] = useState<WorkMode[]>([]);
  const [platformIds, setPlatformIds] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<
    { id: string; slug: string; name: string; logo_path: string | null; work_modes: string[] }[]
  >([]);
  const [preferredName, setPreferredName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [monthlyGoal, setMonthlyGoal] = useState('');
  const [basis, setBasis] = useState<'gross' | 'net'>('gross');
  const [saving, setSaving] = useState(false);

  // Vehicle. Optional, but the cost per kilometre on every later screen comes
  // from it, so it is worth one screen here rather than a nudge later.
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [makeId, setMakeId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [fuelType, setFuelType] = useState<FuelType | null>(null);
  const [ownership, setOwnership] = useState<VehicleOwnership | null>(null);

  const makes = useMakes(vehicleType);
  const models = useModels(makeId, vehicleType);

  useEffect(() => {
    void supabase
      .from('platforms')
      .select('id, slug, name, logo_path, work_modes')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setPlatforms((data as typeof platforms | null) ?? []));
  }, []);

  useEffect(() => {
    if (profile?.preferredName) setPreferredName(profile.preferredName);
    else if (profile?.firstName) setPreferredName(profile.firstName);
  }, [profile?.firstName, profile?.preferredName]);

  const monthlyCents = parseCents(monthlyGoal);
  const suggestions = monthlyCents ? deriveGoalSuggestions(monthlyCents) : null;

  // Only show platforms that match how the driver said they work.
  const relevantPlatforms = useMemo(
    () =>
      platforms.filter(
        (platform) =>
          workModes.length === 0 ||
          platform.work_modes.some((mode) => workModes.includes(mode as WorkMode)),
      ),
    [platforms, workModes],
  );

  function toggle<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  async function finish() {
    if (!session?.user) return;
    setSaving(true);

    const trimmedName = preferredName.trim();
    const trimmedCity = city.trim();

    const trimmedPhone = phone.trim();

    await supabase
      .from('profiles')
      .update({
        work_modes: workModes,
        preferred_name: trimmedName === '' ? null : trimmedName,
        phone: trimmedPhone === '' ? null : trimmedPhone,
        city: trimmedCity === '' ? null : trimmedCity,
        state: state ?? null,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', session.user.id);

    if (vehicleType) {
      const { count } = await supabase
        .from('user_vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .is('archived_at', null);

      await supabase.from('user_vehicles').insert({
        user_id: session.user.id,
        vehicle_type: vehicleType,
        version_id: null,
        custom_label: models.find((model) => model.id === modelId)?.name ?? null,
        fuel_type: fuelType,
        ownership,
        is_primary: (count ?? 0) === 0,
      });
    }

    if (platformIds.length > 0) {
      await supabase
        .from('user_platforms')
        .insert(platformIds.map((id) => ({ user_id: session.user!.id, platform_id: id })));
    }

    // All four periods, not just the two the driver can picture: they all
    // follow from the one number, so they are all written from it.
    if (monthlyCents) {
      await applyMonthlyGoal({ userId: session.user.id, monthly: monthlyCents, basis });
    }

    void track('onboarding_completed', { work_modes: workModes });
    await refresh();
    setSaving(false);
    router.replace('/(tabs)');
  }

  const steps: StepDefinition[] = [
    {
      key: 'welcome',
      title: 'Bem-vindo ao Dinamique',
      subtitle: 'Vamos fazer 5 perguntas rápidas. Leva menos de um minuto.',
      canAdvance: true,
      content: (
        <Card padding="xl" style={{ gap: theme.spacing.lg }}>
          {[
            {
              icon: 'wallet' as IconName,
              title: 'Quanto você realmente ganhou',
              text: 'Não é o valor que o aplicativo mostra. É o que sobra depois dos custos.',
            },
            {
              icon: 'target' as IconName,
              title: 'Uma meta que cabe no seu dia',
              text: 'Você diz quanto quer no mês, a gente divide por dia.',
            },
            {
              icon: 'compass' as IconName,
              title: 'Explicado em português claro',
              text: 'Nada de gráfico difícil. Frases curtas dizendo o que mudou.',
            },
          ].map((item) => (
            <View
              key={item.title}
              style={{ flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: theme.radius.pill,
                  backgroundColor: theme.colors.brandPrimarySubtle,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={item.icon} size={20} color={theme.colors.brandPrimary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{item.title}</Text>
                <Text variant="body" color="secondary">
                  {item.text}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      ),
    },
    {
      key: 'work-modes',
      title: 'Como você trabalha?',
      subtitle: 'Pode marcar mais de uma. Dá para mudar depois.',
      canAdvance: workModes.length > 0,
      content: (
        <View style={{ gap: theme.spacing.md }}>
          {WORK_MODE_OPTIONS.map((option) => (
            <OptionCard
              key={option.value}
              label={option.label}
              description={option.description}
              icon={option.icon}
              multiple
              selected={workModes.includes(option.value)}
              onPress={() => setWorkModes(toggle(workModes, option.value))}
            />
          ))}
        </View>
      ),
    },
    {
      key: 'platforms',
      title: 'Quais aplicativos você usa?',
      subtitle: 'Marque os que você usa hoje. Se não usar nenhum, é só pular.',
      canAdvance: true,
      skippable: platformIds.length === 0,
      content:
        relevantPlatforms.length === 0 ? (
          <Card padding="xl">
            <Text variant="body" color="secondary">
              Ainda não temos aplicativos cadastrados para esse tipo de trabalho. Você pode seguir
              em frente sem problema.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {relevantPlatforms.map((platform) => (
              <OptionCard
                key={platform.id}
                label={platform.name}
                multiple
                leading={
                  <PlatformMark
                    slug={platform.slug}
                    name={platform.name}
                    logoPath={platform.logo_path}
                  />
                }
                selected={platformIds.includes(platform.id)}
                onPress={() => setPlatformIds(toggle(platformIds, platform.id))}
              />
            ))}
          </View>
        ),
    },
    {
      key: 'name',
      title: 'Como podemos te chamar?',
      subtitle: 'É o nome que aparece na tela inicial. Um apelido serve.',
      canAdvance: true,
      skippable: preferredName.trim() === '',
      content: (
        <Field
          label="Seu nome"
          iconName="user"
          placeholder="Ex.: Zé, Dona Maria, Carlinhos"
          value={preferredName}
          onChangeText={setPreferredName}
          hint="Só você vê esse nome."
        />
      ),
    },
    {
      key: 'phone',
      title: 'Um telefone para contato',
      subtitle: 'Só usamos se você abrir um chamado no suporte. Nada de ligação de venda.',
      canAdvance: true,
      skippable: phone.trim() === '',
      content: (
        <Field
          label="Telefone"
          iconName="phone"
          optional
          placeholder="(11) 90000-0000"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
      ),
    },
    {
      key: 'place',
      title: 'Onde você roda?',
      subtitle: 'Serve para comparar seus números com os de quem roda perto de você.',
      canAdvance: true,
      skippable: city.trim() === '' && state === null,
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          <Field
            label="Cidade"
            iconName="route"
            optional
            placeholder="Ex.: Campinas"
            value={city}
            onChangeText={setCity}
          />
          <Select
            label="Estado"
            optional
            value={state}
            options={STATES.map((uf) => ({ value: uf, label: uf }))}
            onChange={setState}
            placeholder="Selecione o estado"
          />
          <Card padding="lg" tone="secondary" style={{ flexDirection: 'row', gap: theme.spacing.md }}>
            <Icon name="shield" size={18} color={theme.colors.textSecondary} />
            <Text variant="caption" color="secondary" style={{ flex: 1 }}>
              A comparação é anônima. Ninguém vê os seus números, e você não vê os de ninguém – só
              a média da região.
            </Text>
          </Card>
        </View>
      ),
    },
    {
      key: 'vehicle',
      title: 'Qual veículo você usa?',
      subtitle: 'É com isso que calculamos seu custo por quilômetro. Dá para preencher depois.',
      canAdvance: true,
      skippable: vehicleType === null,
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.sm }}>
            <OptionCard
              label="Carro"
              icon="car"
              selected={vehicleType === 'car'}
              onPress={() => {
                setVehicleType('car');
                setMakeId(null);
                setModelId(null);
              }}
            />
            <OptionCard
              label="Moto"
              icon="route"
              selected={vehicleType === 'motorcycle'}
              onPress={() => {
                setVehicleType('motorcycle');
                setMakeId(null);
                setModelId(null);
              }}
            />
          </View>

          {vehicleType ? (
            <>
              <Select
                label="Marca"
                optional
                value={makeId}
                options={makes.map((make) => ({ value: make.id, label: make.name }))}
                onChange={(value) => {
                  setMakeId(value);
                  setModelId(null);
                }}
                placeholder="Escolha a marca"
              />
              <Select
                label="Modelo"
                optional
                value={modelId}
                options={models.map((model) => ({ value: model.id, label: model.name }))}
                onChange={setModelId}
                placeholder={makeId ? 'Escolha o modelo' : 'Escolha a marca primeiro'}
              />
              <Select
                label="Combustível"
                optional
                value={fuelType}
                options={[
                  { value: 'gasoline', label: 'Gasolina' },
                  { value: 'ethanol', label: 'Etanol' },
                  { value: 'flex', label: 'Flex' },
                  { value: 'diesel', label: 'Diesel' },
                  { value: 'gnv', label: 'GNV' },
                  { value: 'electric', label: 'Elétrico' },
                ]}
                onChange={(value) => setFuelType(value as FuelType)}
                placeholder="Escolha o combustível"
              />
              <Select
                label="O veículo é"
                optional
                value={ownership}
                options={[
                  { value: 'owned', label: 'Meu, quitado' },
                  { value: 'financed', label: 'Meu, financiado' },
                  { value: 'rented', label: 'Alugado' },
                  { value: 'borrowed', label: 'Emprestado' },
                ]}
                onChange={(value) => setOwnership(value as VehicleOwnership)}
                placeholder="Escolha uma opção"
              />
            </>
          ) : null}
        </View>
      ),
    },
    {
      key: 'goal',
      title: 'Quanto você quer ganhar por mês?',
      subtitle: 'Um valor de verdade, o que você precisa tirar. A gente divide por dia.',
      canAdvance: monthlyCents !== null && monthlyCents > 0,
      content: (
        <View style={{ gap: theme.spacing.xl }}>
          <AmountInput
            label="Meta do mês"
            value={monthlyGoal}
            onChangeText={setMonthlyGoal}
            placeholder="7.000,00"
            quickValues={[
              { label: 'R$ 3.000', value: '3000' },
              { label: 'R$ 5.000', value: '5000' },
              { label: 'R$ 7.000', value: '7000' },
              { label: 'R$ 10.000', value: '10000' },
            ]}
          />

          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="captionStrong" color="secondary">
              ESSE VALOR É...
            </Text>
            <OptionCard
              label="O que entra no bolso"
              description="Tudo que você recebe, antes de descontar gasolina e custos"
              icon="wallet"
              selected={basis === 'gross'}
              onPress={() => setBasis('gross')}
            />
            <OptionCard
              label="O que sobra no fim"
              description="Já descontando gasolina, manutenção e o resto"
              icon="trendUp"
              selected={basis === 'net'}
              onPress={() => setBasis('net')}
            />
          </View>

          {suggestions ? (
            <Card padding="lg" tone="brand" style={{ gap: theme.spacing.xs }}>
              <Text variant="bodyStrong" color="brand">
                Sua meta por dia fica em {formatCents(suggestions.daily)}
              </Text>
              <Text variant="caption" color="secondary">
                Ou {formatCents(suggestions.weekly)} por semana. Dá para mudar quando quiser.
              </Text>
            </Card>
          ) : null}
        </View>
      ),
    },
    {
      key: 'done',
      title: 'Pronto, é só isso',
      subtitle: 'Já dá para começar. O resto o Dinamique aprende com o seu dia a dia.',
      canAdvance: true,
      content: (
        <Card padding="xl" style={{ gap: theme.spacing.lg }}>
          <Summary
            label="Você trabalha com"
            value={
              workModes.length === 0
                ? '–'
                : workModes
                    .map((mode) => WORK_MODE_OPTIONS.find((option) => option.value === mode)?.label)
                    .filter(Boolean)
                    .join(' · ')
            }
          />
          <Summary
            label="Aplicativos"
            value={
              platformIds.length === 0
                ? 'Nenhum por enquanto'
                : platforms
                    .filter((platform) => platformIds.includes(platform.id))
                    .map((platform) => platform.name)
                    .join(', ')
            }
          />
          <Summary
            label="Meta do mês"
            value={monthlyCents ? formatCents(monthlyCents) : 'Sem meta ainda'}
          />
          {suggestions ? (
            <Summary label="Que dá por dia" value={formatCents(suggestions.daily)} />
          ) : null}
        </Card>
      ),
    },
  ];

  const current = steps[step]!;
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  return (
    <Screen
      header={
        <ScreenHeader
          onBack={isFirst ? undefined : () => setStep(step - 1)}
          transparent
          actions={
            current.skippable ? (
              <Button label="Pular" variant="ghost" size="sm" onPress={() => setStep(step + 1)} />
            ) : null
          }
        >
          <View style={{ flex: 1, alignItems: isFirst ? 'flex-start' : 'center' }}>
            <BrandMark size="sm" />
          </View>
        </ScreenHeader>
      }
      gap="xl"
      grow
      footer={
        <Button
          label={isLast ? 'Começar a usar' : 'Continuar'}
          size="lg"
          fullWidth
          loading={saving}
          disabled={!current.canAdvance}
          iconName={isLast ? 'check' : 'chevronRight'}
          iconPosition="trailing"
          onPress={() => (isLast ? void finish() : setStep(step + 1))}
        />
      }
    >
      <StepProgress
        current={step}
        total={steps.length}
        countLabel={(a, b) => `Passo ${a} de ${b}`}
      />

      <View style={{ gap: theme.spacing.sm }}>
        <Text
          variant="titleLg"
          style={{ fontSize: scale(28, { min: 24, max: 34 }), lineHeight: scale(34, { min: 30, max: 40 }) }}
        >
          {current.title}
        </Text>
        <Text variant="body" color="secondary">
          {current.subtitle}
        </Text>
      </View>

      {current.content}
    </Screen>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.xxs }}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
      <Text variant="bodyStrong">{value}</Text>
    </View>
  );
}
