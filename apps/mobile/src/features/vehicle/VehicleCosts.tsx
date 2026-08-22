import { View } from 'react-native';
import type { RecurringCostPeriod, VehicleOwnership } from '@dinamique/types';
import { parseCents } from '@dinamique/utils';
import { AmountInput, Card, Chip, Field, Icon, Reveal, Text, useTheme } from '@dinamique/ui';
import { useCostCategories } from '@/features/costs/categories';
import {
  endDateFromInstalments,
  PERIOD_LABELS,
  PERIOD_ORDER,
  VEHICLE_COST_SLUGS,
} from '@/features/onboarding/fixedCosts';

/**
 * What a vehicle costs to keep, as a piece of form and as a set of rows.
 *
 * The pairing is the point. Asking "financiado ou alugado?" and stopping there
 * records that there is a debt and not how big it is, which is worth almost
 * nothing: the instalment is usually the largest single line in a driver's
 * month. So the amount is asked in the same breath as the ownership, on the
 * same screen, wherever the ownership is asked – during onboarding and again
 * when a second vehicle is added later.
 *
 * Every field is optional. Someone who does not remember how many instalments
 * are left should be able to move on and answer later, not be stopped.
 */
export interface VehicleCostAnswers {
  instalment: string;
  instalmentsLeft: string;
  rent: string;
  rentPeriod: RecurringCostPeriod;
}

export const EMPTY_VEHICLE_COSTS: VehicleCostAnswers = {
  instalment: '',
  instalmentsLeft: '',
  rent: '',
  rentPeriod: 'weekly',
};

export interface VehicleCostQuestionsProps {
  ownership: VehicleOwnership | null;
  answers: VehicleCostAnswers;
  onChange: (patch: Partial<VehicleCostAnswers>) => void;
  /** Shown under "quitado", where there is nothing else to ask. */
  ownedHint?: string;
}

export function VehicleCostQuestions({
  ownership,
  answers,
  onChange,
  ownedHint,
}: VehicleCostQuestionsProps) {
  const theme = useTheme();

  if (ownership === 'financed') {
    return (
      <Reveal>
        <Card padding="xl" style={{ gap: theme.spacing.lg }}>
          <AmountInput
            label="Valor da parcela"
            value={answers.instalment}
            onChangeText={(value) => onChange({ instalment: value })}
            placeholder="1.200,00"
            hint="O que sai por mês do financiamento."
          />
          <Field
            label="Parcelas que faltam"
            optional
            iconName="clock"
            placeholder="Ex.: 18"
            keyboardType="number-pad"
            value={answers.instalmentsLeft}
            onChangeText={(value) => onChange({ instalmentsLeft: value })}
            hint="Se não souber agora, deixe em branco."
          />
        </Card>
      </Reveal>
    );
  }

  if (ownership === 'rented') {
    return (
      <Reveal>
        <Card padding="xl" style={{ gap: theme.spacing.lg }}>
          <AmountInput
            label="Valor do aluguel"
            value={answers.rent}
            onChangeText={(value) => onChange({ rent: value })}
            placeholder="600,00"
          />
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="captionStrong" color="secondary">
              VOCÊ PAGA
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {PERIOD_ORDER.map((period) => (
                <Chip
                  key={period}
                  label={PERIOD_LABELS[period]}
                  selected={answers.rentPeriod === period}
                  onPress={() => onChange({ rentPeriod: period })}
                />
              ))}
            </View>
            <Text variant="caption" color="muted">
              Paga por dia? Informe quanto dá na semana.
            </Text>
          </View>
        </Card>
      </Reveal>
    );
  }

  if (ownership === 'owned' && ownedHint) {
    return (
      <Card padding="lg" tone="secondary" style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        <Icon name="check" size={18} color={theme.colors.successText} />
        <Text variant="caption" color="secondary" style={{ flex: 1 }}>
          {ownedHint}
        </Text>
      </Card>
    );
  }

  return null;
}

/**
 * The recurring rows that follow from the answers above.
 *
 * `end_date` carries "faltam 18 parcelas", because that is the number a driver
 * has in their head and a date is what the table stores.
 */
export function vehicleCostRows(input: {
  userId: string;
  vehicleId: string | null;
  ownership: VehicleOwnership | null;
  answers: VehicleCostAnswers;
  categoryIdBySlug: Record<string, string>;
}): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const { answers, categoryIdBySlug } = input;

  const instalment = parseCents(answers.instalment);
  if (input.ownership === 'financed' && instalment && instalment > 0) {
    rows.push({
      user_id: input.userId,
      vehicle_id: input.vehicleId,
      category_id: categoryIdBySlug.financiamento,
      label: 'Parcela do veículo',
      amount: instalment,
      period: 'monthly',
      end_date: endDateFromInstalments(Number(answers.instalmentsLeft.replace(/\D/g, ''))),
    });
  }

  const rent = parseCents(answers.rent);
  if (input.ownership === 'rented' && rent && rent > 0) {
    rows.push({
      user_id: input.userId,
      vehicle_id: input.vehicleId,
      category_id: categoryIdBySlug.aluguel,
      label: 'Aluguel do veículo',
      amount: rent,
      period: answers.rentPeriod,
    });
  }

  // A row with no category would be rejected by the database; dropping it here
  // loses one cost instead of the whole batch.
  return rows.filter((row) => typeof row.category_id === 'string');
}

export { useCostCategories, VEHICLE_COST_SLUGS };
