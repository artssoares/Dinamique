import type { GoalBasis, GoalPeriod } from '@dinamique/types';
import { deriveGoalSuggestions } from '@dinamique/business-logic';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

export const GOAL_PERIODS: GoalPeriod[] = ['daily', 'weekly', 'monthly', 'yearly'];

/**
 * Writes all four periods from a single monthly figure.
 *
 * The driver gives one number, so all four goals follow from it: a daily
 * target that contradicts the monthly one is not two goals, it is a bug the
 * driver has to reconcile in their head. `deriveGoalSuggestions` owns the
 * arithmetic; this only persists it.
 *
 * A unique index allows one active goal per period, so each period is updated
 * in place when it already exists and inserted when it does not.
 */
export async function applyMonthlyGoal(input: {
  userId: string;
  monthly: number;
  basis: GoalBasis;
}): Promise<void> {
  const targets = deriveGoalSuggestions(input.monthly);

  const { data: existing } = await supabase
    .from('goals')
    .select('id, period')
    .eq('user_id', input.userId)
    .eq('is_active', true);

  const byPeriod = new Map(
    ((existing as { id: string; period: GoalPeriod }[] | null) ?? []).map((row) => [
      row.period,
      row.id,
    ]),
  );

  const inserts: Record<string, unknown>[] = [];

  for (const period of GOAL_PERIODS) {
    const id = byPeriod.get(period);
    if (id) {
      await supabase
        .from('goals')
        .update({ target: targets[period], basis: input.basis })
        .eq('id', id);
    } else {
      inserts.push({
        user_id: input.userId,
        period,
        basis: input.basis,
        target: targets[period],
      });
    }
  }

  if (inserts.length > 0) {
    await supabase.from('goals').insert(inserts);
  }

  void track('goal_created', { period: 'monthly' });
}
