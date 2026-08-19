import type { Cents } from '@dinamique/types';

/**
 * Nota do dia (§45) – a 0–10 score with a fully documented, deterministic
 * formula. No arbitrary weights invented at render time; no model.
 *
 * The score is the weighted mean of the components we can actually measure,
 * renormalised over whichever ones are available. A component with no data is
 * dropped rather than defaulted, so a driver without odometer readings is not
 * punished for it.
 *
 *   goal        weight 4 – progress against today's goal, capped at 1.0
 *   profitHour  weight 3 – today's profit/hour vs the personal average
 *   profitKm    weight 2 – today's profit/km vs the personal average
 *   costRatio   weight 1 – expense share vs the personal average (inverted)
 *
 * Ratio components map to 0..1 with 1.0 meaning "matched your average" at 0.5
 * and "double your average" at 1.0, i.e. `clamp(ratio / 2, 0, 1)`. Beating your
 * own average therefore scores above the midpoint, which is the intent.
 */

export interface ScoreInput {
  goalTarget: Cents | null;
  goalAchieved: Cents;
  profitPerHourToday: Cents | null;
  profitPerHourAverage: Cents | null;
  profitPerKmToday: Cents | null;
  profitPerKmAverage: Cents | null;
  expenseRatioToday: number | null;
  expenseRatioAverage: number | null;
}

export interface ScoreComponent {
  key: 'goal' | 'profitHour' | 'profitKm' | 'costRatio';
  weight: number;
  /** 0..1 */
  value: number;
}

export interface DailyScore {
  /** 0.0–10.0, one decimal place. */
  score: number;
  components: ScoreComponent[];
  /** False when nothing measurable existed; the UI shows an empty state. */
  hasData: boolean;
}

const WEIGHTS = { goal: 4, profitHour: 3, profitKm: 2, costRatio: 1 } as const;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Relative performance mapped so that "equal to your average" sits at 0.5. */
function relativeScore(today: number, average: number): number | null {
  if (average <= 0) return null;
  return clamp01(today / average / 2);
}

export function computeDailyScore(input: ScoreInput): DailyScore {
  const components: ScoreComponent[] = [];

  if (input.goalTarget !== null && input.goalTarget > 0) {
    components.push({
      key: 'goal',
      weight: WEIGHTS.goal,
      value: clamp01(input.goalAchieved / input.goalTarget),
    });
  }

  if (input.profitPerHourToday !== null && input.profitPerHourAverage !== null) {
    const value = relativeScore(input.profitPerHourToday, input.profitPerHourAverage);
    if (value !== null) {
      components.push({ key: 'profitHour', weight: WEIGHTS.profitHour, value });
    }
  }

  if (input.profitPerKmToday !== null && input.profitPerKmAverage !== null) {
    const value = relativeScore(input.profitPerKmToday, input.profitPerKmAverage);
    if (value !== null) {
      components.push({ key: 'profitKm', weight: WEIGHTS.profitKm, value });
    }
  }

  if (input.expenseRatioToday !== null && input.expenseRatioAverage !== null && input.expenseRatioAverage > 0) {
    // Inverted: spending less of your revenue than usual scores higher.
    const value = clamp01(1 - input.expenseRatioToday / input.expenseRatioAverage / 2);
    components.push({ key: 'costRatio', weight: WEIGHTS.costRatio, value });
  }

  if (components.length === 0) {
    return { score: 0, components, hasData: false };
  }

  const totalWeight = components.reduce((acc, c) => acc + c.weight, 0);
  const weighted = components.reduce((acc, c) => acc + c.weight * c.value, 0);
  const score = Math.round((weighted / totalWeight) * 100) / 10;

  return { score, components, hasData: true };
}

/** Short label shown next to the number. Thresholds are fixed and documented. */
export function scoreLabel(score: number): string {
  if (score >= 8.5) return 'Dia excelente';
  if (score >= 7) return 'Bom resultado';
  if (score >= 5) return 'Dia dentro da média';
  if (score >= 3) return 'Abaixo da sua média';
  return 'Dia difícil';
}
