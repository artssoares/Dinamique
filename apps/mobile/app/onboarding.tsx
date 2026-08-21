import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type {
  FuelType,
  RecurringCostPeriod,
  VehicleOwnership,
  VehicleType,
  WorkMode,
} from '@dinamique/types';
import { deriveGoalSuggestions } from '@dinamique/business-logic';
import { formatCents, parseCents } from '@dinamique/utils';
import {
  AmountInput,
  Button,
  Card,
  Chip,
  Field,
  Icon,
  Notice,
  OptionCard,
  Reveal,
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
import { toFriendlyError } from '@/lib/errors';
import { useSession } from '@/hooks/useSession';
import { BrandMark } from '@/features/brand/BrandMark';
import { PlatformMark } from '@/features/platforms/PlatformMark';
import {
  FIXED_COST_OPTIONS,
  ONBOARDING_COST_SLUGS,
  PERIOD_LABELS,
  PERIOD_ORDER,
} from '@/features/onboarding/fixedCosts';
import {
  EMPTY_VEHICLE_COSTS,
  useCostCategories,
  VehicleCostQuestions,
  vehicleCostRows,
  type VehicleCostAnswers,
} from '@/features/vehicle/VehicleCosts';
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

/**
 * Every vehicle the app supports, not only the car. A motoboy pays an
 * instalment exactly like a driver does, and asking only about cars is how a
 * bike courier ends up with no costs and an imaginary profit.
 */
const VEHICLE_TYPES: {
  value: VehicleType;
  label: string;
  description: string;
  icon: IconName;
  /** A bicycle has no engine and no catalogue: those questions are skipped. */
  motorised: boolean;
}[] = [
  { value: 'car', label: 'Carro', description: 'Passageiros, entregas ou fretes', icon: 'car', motorised: true },
  { value: 'motorcycle', label: 'Moto', description: 'Entregas e mototáxi', icon: 'route', motorised: true },
  { value: 'electric', label: 'Elétrico', description: 'Carro ou moto elétrica', icon: 'trendUp', motorised: true },
  { value: 'bicycle', label: 'Bicicleta', description: 'Com ou sem motor elétrico', icon: 'compass', motorised: false },
];

/** Só os valores que existem no banco. Um a mais e o cadastro falha calado. */
const FUEL_OPTIONS: { value: FuelType; label: string }[] = [
  { value: 'gasoline', label: 'Gasolina' },
  { value: 'ethanol', label: 'Etanol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'cng', label: 'GNV' },
  { value: 'electric', label: 'Elétrico' },
];

const OWNERSHIP_OPTIONS: {
  value: VehicleOwnership;
  label: string;
  description: string;
  icon: IconName;
}[] = [
  { value: 'owned', label: 'Meu, já quitado', description: 'Não pago parcela nem aluguel', icon: 'check' },
  { value: 'financed', label: 'Meu, financiado', description: 'Pago parcela todo mês', icon: 'receipt' },
  { value: 'rented', label: 'Alugado', description: 'Pago aluguel para rodar', icon: 'wallet' },
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
  /** Wording of the skip control. Costs say "deixar para depois". */
  skipLabel?: string;
}

interface CostEntry {
  amount: string;
  period: RecurringCostPeriod;
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
 * much you want to earn – are required. Everything else can be left for later,
 * and says so on the screen rather than hiding the way out in a corner.
 *
 * Money questions follow the answer that makes them relevant, in the same
 * step: saying the vehicle is financed and being asked nothing about the
 * instalment is how the app ends up knowing there is a debt and not how much.
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
    {
      id: string;
      slug: string;
      name: string;
      logo_path: string | null;
      brand_color: string | null;
      work_modes: string[];
    }[]
  >([]);
  const [preferredName, setPreferredName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [monthlyGoal, setMonthlyGoal] = useState('');
  const [basis, setBasis] = useState<'gross' | 'net'>('gross');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Vehicle. Optional, but the cost per kilometre on every later screen comes
  // from it, so it is worth one screen here rather than a nudge later.
  const [vehicleType, setVehicleType] = useState<VehicleType | null>(null);
  const [makeId, setMakeId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [fuelType, setFuelType] = useState<FuelType | null>(null);
  const [ownership, setOwnership] = useState<VehicleOwnership | null>(null);

  // What the vehicle costs, asked in the same breath as how it is owned.
  const [vehicleCosts, setVehicleCosts] = useState<VehicleCostAnswers>(EMPTY_VEHICLE_COSTS);

  // Everything else that goes out whether the vehicle moves or not.
  const [fixedCosts, setFixedCosts] = useState<Record<string, CostEntry>>({});
  const costCategories = useCostCategories(ONBOARDING_COST_SLUGS);

  const makes = useMakes(vehicleType);
  const models = useModels(makeId, vehicleType);

  useEffect(() => {
    void supabase
      .from('platforms')
      .select('id, slug, name, logo_path, brand_color, work_modes')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setPlatforms((data as typeof platforms | null) ?? []));
  }, []);

  useEffect(() => {
    if (profile?.preferredName) setPreferredName(profile.preferredName);
    else if (profile?.firstName) setPreferredName(profile.firstName);
  }, [profile?.firstName, profile?.preferredName]);

  // An electric vehicle has exactly one fuel; asking is a question with one
  // answer, which is a question not worth asking.
  useEffect(() => {
    if (vehicleType === 'electric') setFuelType('electric');
    if (vehicleType === 'bicycle') setFuelType(null);
  }, [vehicleType]);

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

  function toggleFixedCost(slug: string, period: RecurringCostPeriod) {
    setFixedCosts((current) => {
      const next = { ...current };
      if (next[slug]) delete next[slug];
      else next[slug] = { amount: '', period };
      return next;
    });
  }

  function setFixedCost(slug: string, patch: Partial<CostEntry>) {
    setFixedCosts((current) => ({
      ...current,
      [slug]: { amount: '', period: 'monthly', ...current[slug], ...patch },
    }));
  }

  /** The recurring rows this onboarding has enough information to write. */
  function recurringRows(userId: string, vehicleId: string | null): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = vehicleCostRows({
      userId,
      vehicleId,
      ownership,
      answers: vehicleCosts,
      categoryIdBySlug: costCategories,
    });

    for (const option of FIXED_COST_OPTIONS) {
      const entry = fixedCosts[option.slug];
      if (!entry) continue;
      const amount = parseCents(entry.amount);
      if (!amount || amount <= 0) continue;
      rows.push({
        user_id: userId,
        vehicle_id: vehicleId,
        category_id: costCategories[option.slug],
        label: option.label,
        amount,
        period: entry.period,
      });
    }

    // A row with no category would be rejected by the database; dropping it
    // here loses one cost instead of the whole batch.
    return rows.filter((row) => typeof row.category_id === 'string');
  }

  async function finish() {
    if (!session?.user) return;
    const userId = session.user.id;
    setSaving(true);
    setFailure(null);

    const trimmedName = preferredName.trim();
    const trimmedCity = city.trim();
    const trimmedPhone = phone.trim();

    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        work_modes: workModes,
        preferred_name: trimmedName === '' ? null : trimmedName,
        phone: trimmedPhone === '' ? null : trimmedPhone,
        city: trimmedCity === '' ? null : trimmedCity,
        state: state ?? null,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', userId);

    // Without this row the router sends the person straight back here, so a
    // silent failure was an endless onboarding. Now it says what happened.
    if (profileError) {
      setFailure(toFriendlyError(profileError).message);
      setSaving(false);
      return;
    }

    let vehicleId: string | null = null;

    if (vehicleType) {
      const { count } = await supabase
        .from('user_vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('archived_at', null);

      const { data: vehicle } = await supabase
        .from('user_vehicles')
        .insert({
          user_id: userId,
          vehicle_type: vehicleType,
          version_id: null,
          custom_label: models.find((model) => model.id === modelId)?.name ?? null,
          fuel_type: fuelType,
          ownership: ownership ?? 'owned',
          is_primary: (count ?? 0) === 0,
        })
        .select('id')
        .maybeSingle();

      vehicleId = vehicle ? String(vehicle.id) : null;
    }

    const costs = recurringRows(userId, vehicleId);
    if (costs.length > 0) {
      await supabase.from('recurring_costs').insert(costs);
    }

    if (platformIds.length > 0) {
      await supabase
        .from('user_platforms')
        .insert(platformIds.map((id) => ({ user_id: userId, platform_id: id })));
    }

    // All four periods, not just the two the driver can picture: they all
    // follow from the one number, so they are all written from it.
    if (monthlyCents) {
      await applyMonthlyGoal({ userId, monthly: monthlyCents, basis });
    }

    void track('onboarding_completed', {
      work_modes: workModes,
      vehicle: vehicleType,
      ownership,
      fixed_costs: costs.length,
    });
    await refresh();
    setSaving(false);
    router.replace('/(tabs)');
  }

  const selectedType = VEHICLE_TYPES.find((option) => option.value === vehicleType) ?? null;

  const steps: StepDefinition[] = [
    {
      key: 'welcome',
      title: 'Bem-vindo ao Dinamique',
      subtitle: 'São perguntas rápidas, e o que você não souber agora pode ficar para depois.',
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
                    brandColor={platform.brand_color}
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
      title: 'Com o que você roda?',
      subtitle: 'É daqui que sai o seu custo por quilômetro. Dá para preencher depois.',
      canAdvance: true,
      skippable: vehicleType === null,
      skipLabel: 'Não tenho veículo fixo',
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.sm }}>
            {VEHICLE_TYPES.map((option) => (
              <OptionCard
                key={option.value}
                label={option.label}
                description={option.description}
                icon={option.icon}
                selected={vehicleType === option.value}
                onPress={() => {
                  setVehicleType(option.value);
                  setMakeId(null);
                  setModelId(null);
                }}
              />
            ))}
          </View>

          {selectedType?.motorised ? (
            <Reveal>
              <View style={{ gap: theme.spacing.lg }}>
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
                  emptyLabel="Ainda não temos marcas para esse tipo"
                />
                <Select
                  label="Modelo"
                  optional
                  value={modelId}
                  options={models.map((model) => ({ value: model.id, label: model.name }))}
                  onChange={setModelId}
                  placeholder={makeId ? 'Escolha o modelo' : 'Escolha a marca primeiro'}
                  emptyLabel="Escolha a marca primeiro"
                />
                {vehicleType === 'electric' ? null : (
                  <View style={{ gap: theme.spacing.sm }}>
                    <Text variant="captionStrong" color="secondary">
                      COMBUSTÍVEL
                    </Text>
                    <View
                      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}
                    >
                      {FUEL_OPTIONS.map((fuel) => (
                        <Chip
                          key={fuel.value}
                          label={fuel.label}
                          selected={fuelType === fuel.value}
                          onPress={() =>
                            setFuelType(fuelType === fuel.value ? null : fuel.value)
                          }
                        />
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </Reveal>
          ) : null}
        </View>
      ),
    },
    {
      key: 'vehicle-cost',
      title: 'Esse veículo é seu?',
      subtitle: 'Se você paga parcela ou aluguel, é o maior custo do seu mês. Vamos incluir.',
      canAdvance: true,
      skippable: true,
      skipLabel: 'Deixar para depois',
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.sm }}>
            {OWNERSHIP_OPTIONS.map((option) => (
              <OptionCard
                key={option.value}
                label={option.label}
                description={option.description}
                icon={option.icon}
                selected={ownership === option.value}
                onPress={() => setOwnership(option.value)}
              />
            ))}
          </View>

          {/* The money question follows the answer that makes it relevant, on
              the same screen. Sending someone to another screen for it is how
              it never gets answered. */}
          <VehicleCostQuestions
            ownership={ownership}
            answers={vehicleCosts}
            onChange={(patch) => setVehicleCosts((current) => ({ ...current, ...patch }))}
            ownedHint="Sem parcela nem aluguel. Na próxima tela dá para incluir seguro, IPVA e o resto."
          />
        </View>
      ),
    },
    {
      key: 'fixed-costs',
      title: 'O que mais você paga todo mês?',
      subtitle: 'Toque no que se aplica e informe o valor. O que faltar entra depois.',
      canAdvance: true,
      skippable: true,
      skipLabel: 'Deixar para depois',
      content: (
        <View style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {FIXED_COST_OPTIONS.map((option) => (
              <Chip
                key={option.slug}
                label={option.label}
                multiple
                iconName={option.icon}
                selected={fixedCosts[option.slug] !== undefined}
                onPress={() => toggleFixedCost(option.slug, option.period)}
              />
            ))}
          </View>

          {FIXED_COST_OPTIONS.filter((option) => fixedCosts[option.slug] !== undefined).map(
            (option) => {
              const entry = fixedCosts[option.slug]!;
              return (
                <Reveal key={option.slug}>
                  <Card padding="lg" style={{ gap: theme.spacing.md }}>
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
                    >
                      <Icon name={option.icon} size={18} color={theme.colors.brandPrimary} />
                      <Text variant="bodyStrong">{option.label}</Text>
                      <View style={{ flex: 1 }} />
                      <Text variant="caption" color="muted">
                        {option.hint}
                      </Text>
                    </View>

                    <Field
                      label="Valor"
                      value={entry.amount}
                      onChangeText={(value) => setFixedCost(option.slug, { amount: value })}
                      keyboardType="decimal-pad"
                      placeholder="R$ 0,00"
                    />

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                      {PERIOD_ORDER.map((period) => (
                        <Chip
                          key={period}
                          label={PERIOD_LABELS[period]}
                          selected={entry.period === period}
                          onPress={() => setFixedCost(option.slug, { period })}
                        />
                      ))}
                    </View>
                  </Card>
                </Reveal>
              );
            },
          )}

          <Text variant="caption" color="muted">
            Marcar sem informar o valor não atrapalha: a categoria fica esperando você em Custos
            fixos, dentro do aplicativo.
          </Text>
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
            label="Veículo"
            value={
              selectedType
                ? [
                    selectedType.label,
                    OWNERSHIP_OPTIONS.find((option) => option.value === ownership)?.label,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Fica para depois'
            }
          />
          <Summary label="Custos fixos" value={fixedCostSummary()} />
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

  function fixedCostSummary(): string {
    const named: string[] = [];
    if (ownership === 'financed' && (parseCents(vehicleCosts.instalment) ?? 0) > 0)
      named.push('Parcela');
    if (ownership === 'rented' && (parseCents(vehicleCosts.rent) ?? 0) > 0) named.push('Aluguel');
    for (const option of FIXED_COST_OPTIONS) {
      const entry = fixedCosts[option.slug];
      if (entry && (parseCents(entry.amount) ?? 0) > 0) named.push(option.label);
    }
    return named.length === 0 ? 'Nenhum informado ainda' : named.join(', ');
  }

  // The vehicle cost question only exists once there is a vehicle to ask
  // about, so the index is clamped rather than left pointing past the end.
  const visible = steps.filter((item) => item.key !== 'vehicle-cost' || vehicleType !== null);
  const index = Math.min(step, visible.length - 1);
  const current = visible[index]!;
  const isLast = index === visible.length - 1;
  const isFirst = index === 0;

  return (
    <Screen
      header={
        <ScreenHeader onBack={isFirst ? undefined : () => setStep(index - 1)} transparent>
          <View style={{ flex: 1, alignItems: isFirst ? 'flex-start' : 'center' }}>
            <BrandMark size="sm" />
          </View>
        </ScreenHeader>
      }
      gap="xl"
      grow
      footer={
        <View style={{ gap: theme.spacing.sm }}>
          <Button
            label={isLast ? 'Começar a usar' : 'Continuar'}
            size="lg"
            fullWidth
            loading={saving}
            disabled={!current.canAdvance}
            iconName={isLast ? 'check' : 'chevronRight'}
            iconPosition="trailing"
            onPress={() => (isLast ? void finish() : setStep(index + 1))}
          />
          {/* Skipping used to live in the top-right corner, the furthest point
              on the screen from the thumb that is about to press Continuar.
              It belongs under the primary action, where the choice is made. */}
          {current.skippable && !isLast ? (
            <Button
              label={current.skipLabel ?? 'Pular esta pergunta'}
              variant="ghost"
              size="sm"
              onPress={() => setStep(index + 1)}
            />
          ) : null}
        </View>
      }
    >
      <StepProgress
        current={index}
        total={visible.length}
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

      {failure ? <Notice message={failure} onDismiss={() => setFailure(null)} /> : null}
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
