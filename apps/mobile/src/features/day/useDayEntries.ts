import { useCallback, useEffect, useState } from 'react';
import type { Cents, DateOnly } from '@dinamique/types';
import { summarisePeriod, type PeriodSummary } from '@dinamique/business-logic';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';
import { localDayRange } from '@/features/route/routeDates';

/**
 * Um dia inteiro, aberto para conserto.
 *
 * O aplicativo sempre gravou com a data de hoje e nunca deixou voltar atrás,
 * então quem esqueceu de lançar a terça-feira perdia a terça-feira. E um
 * R$/hora calculado sobre uma semana com um buraco não é uma estimativa ruim,
 * é uma afirmação sobre uma semana que não aconteceu.
 *
 * Aqui o dia é carregado lançamento por lançamento, e cada um pode ser
 * corrigido ou apagado.
 *
 * O resumo é recalculado a partir das próprias linhas em vez de vir da view
 * `daily_totals`: logo depois de uma edição a view ainda pode devolver o valor
 * antigo, e ver o número certo na hora é o motivo de a tela existir. O resumo
 * do topo, que vem da view, continua sendo a fonte para tudo o mais (§120).
 */

export interface DayRevenue {
  id: string;
  amount: Cents;
  tips: Cents;
  tripCount: number | null;
  platformId: string | null;
  platformName: string | null;
  /** Vendas de produto chegam por aqui também, e têm nome próprio. */
  note: string | null;
}

export interface DayExpense {
  id: string;
  amount: Cents;
  categoryId: string;
  categoryName: string;
  isVehicleCost: boolean;
}

export interface DayJourney {
  id: string;
  startedAt: string;
  endedAt: string | null;
  pausedSeconds: number;
  odometerStart: number | null;
  odometerEnd: number | null;
  distanceOverride: number | null;
  distanceGps: number | null;
  status: string;
}

export interface DayEntries {
  revenues: DayRevenue[];
  expenses: DayExpense[];
  journeys: DayJourney[];
  summary: PeriodSummary;
  isEmpty: boolean;
}

/**
 * Meio-dia local, o carimbo de uma jornada lançada à mão.
 *
 * `daily_totals` agrupa jornadas pelo dia local em que começaram, e
 * `localDayRange` é a mesma conversão que o resto do aplicativo usa para achar
 * as jornadas de um dia. Meio-dia cai com folga dentro da janela em qualquer
 * fuso, o que 00:00 não faz.
 */
export function dayNoon(date: DateOnly): string {
  const start = new Date(localDayRange(date).start);
  return new Date(start.getTime() + 12 * 60 * 60 * 1000).toISOString();
}

const EMPTY_SUMMARY = summarisePeriod({ journeys: [], revenues: [], expenses: [] });

const EMPTY: DayEntries = {
  revenues: [],
  expenses: [],
  journeys: [],
  summary: EMPTY_SUMMARY,
  isEmpty: true,
};

export function useDayEntries(date: DateOnly | null) {
  const { session } = useSession();
  const [entries, setEntries] = useState<DayEntries>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session?.user || !date) {
      setEntries(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);

    const window = localDayRange(date);

    const [revenueResult, expenseResult, journeyResult] = await Promise.all([
      supabase
        .from('revenues')
        .select('id, amount, tips, trip_count, platform_id, note, platforms(name)')
        .eq('user_id', session.user.id)
        .eq('date', date)
        .order('created_at'),
      supabase
        .from('expenses')
        .select('id, amount, category_id, expense_categories(name, is_vehicle_cost)')
        .eq('user_id', session.user.id)
        .eq('date', date)
        .order('created_at'),
      // Half-open on purpose: a journey that started at 23:59:59.7 belongs to
      // exactly one day, and no journey belongs to two.
      supabase
        .from('journeys')
        .select(
          'id, status, started_at, ended_at, paused_seconds, odometer_start, odometer_end, distance_override, distance_gps',
        )
        .eq('user_id', session.user.id)
        .gte('started_at', window.start)
        .lt('started_at', window.end)
        .order('started_at'),
    ]);

    const revenues: DayRevenue[] = ((revenueResult.data as Record<string, any>[] | null) ?? []).map(
      (row) => ({
        id: String(row.id),
        amount: Number(row.amount ?? 0),
        tips: Number(row.tips ?? 0),
        tripCount: row.trip_count ?? null,
        platformId: row.platform_id ?? null,
        platformName: row.platforms?.name ?? null,
        note: (row.note as string | null) ?? null,
      }),
    );

    const expenses: DayExpense[] = ((expenseResult.data as Record<string, any>[] | null) ?? []).map(
      (row) => ({
        id: String(row.id),
        amount: Number(row.amount ?? 0),
        categoryId: String(row.category_id),
        categoryName: row.expense_categories?.name ?? 'Outros',
        isVehicleCost: Boolean(row.expense_categories?.is_vehicle_cost),
      }),
    );

    const journeys: DayJourney[] = ((journeyResult.data as Record<string, any>[] | null) ?? []).map(
      (row) => ({
        id: String(row.id),
        startedAt: String(row.started_at),
        endedAt: (row.ended_at as string | null) ?? null,
        pausedSeconds: Number(row.paused_seconds ?? 0),
        odometerStart: (row.odometer_start as number | null) ?? null,
        odometerEnd: (row.odometer_end as number | null) ?? null,
        distanceOverride: (row.distance_override as number | null) ?? null,
        distanceGps: (row.distance_gps as number | null) ?? null,
        status: String(row.status),
      }),
    );

    setEntries({
      revenues,
      expenses,
      journeys,
      summary: summarisePeriod({
        journeys: journeys.map((journey) => ({
          id: journey.id,
          startedAt: journey.startedAt,
          endedAt: journey.endedAt,
          pausedSeconds: journey.pausedSeconds,
          odometerStart: journey.odometerStart,
          odometerEnd: journey.odometerEnd,
          distanceOverride: journey.distanceOverride,
          distanceGps: journey.distanceGps,
        })),
        revenues: revenues.map((revenue) => ({
          date,
          amount: revenue.amount,
          tips: revenue.tips,
          tripCount: revenue.tripCount,
          platformId: revenue.platformId,
        })),
        expenses: expenses.map((expense) => ({
          date,
          amount: expense.amount,
          isVehicleCost: expense.isVehicleCost,
        })),
      }),
      isEmpty: revenues.length === 0 && expenses.length === 0 && journeys.length === 0,
    });
    setLoading(false);
  }, [date, session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const userId = session?.user?.id ?? null;

  const saveRevenue = useCallback(
    async (input: {
      id?: string;
      amount: Cents;
      tripCount: number | null;
      platformId: string | null;
    }) => {
      if (!userId || !date) return;
      if (input.id) {
        await supabase
          .from('revenues')
          .update({
            amount: input.amount,
            trip_count: input.tripCount,
            platform_id: input.platformId,
          })
          .eq('id', input.id);
      } else {
        await supabase.from('revenues').insert({
          user_id: userId,
          date,
          amount: input.amount,
          tips: 0,
          trip_count: input.tripCount,
          platform_id: input.platformId,
        });
      }
      void track(input.id ? 'revenue_edited' : 'revenue_added', { backdated: true });
      await load();
    },
    [date, load, userId],
  );

  const saveExpense = useCallback(
    async (input: { id?: string; amount: Cents; categoryId: string }) => {
      if (!userId || !date) return;
      if (input.id) {
        await supabase
          .from('expenses')
          .update({ amount: input.amount, category_id: input.categoryId })
          .eq('id', input.id);
      } else {
        await supabase.from('expenses').insert({
          user_id: userId,
          date,
          amount: input.amount,
          category_id: input.categoryId,
        });
      }
      void track(input.id ? 'expense_edited' : 'expense_added', { backdated: true });
      await load();
    },
    [date, load, userId],
  );

  /**
   * Tempo e km de um dia que já passou, informados de cabeça.
   *
   * Corrigir uma jornada real preserva o horário em que ela começou, que é um
   * fato observado, e move só o fim: o que o motorista está corrigindo é o
   * tempo trabalhado. A quilometragem entra como `distance_override`, o slot
   * de maior prioridade, que é justamente onde uma correção manual pertence.
   */
  const saveJourney = useCallback(
    async (input: { id?: string; workedSeconds: number; distance: number | null }) => {
      if (!userId || !date) return;
      const existing = entries.journeys.find((journey) => journey.id === input.id);
      const startedAt = existing?.startedAt ?? dayNoon(date);
      const pausedSeconds = existing?.pausedSeconds ?? 0;
      const endedAt = new Date(
        Date.parse(startedAt) + (input.workedSeconds + pausedSeconds) * 1000,
      ).toISOString();

      if (input.id) {
        await supabase
          .from('journeys')
          .update({
            status: 'completed',
            ended_at: endedAt,
            paused_at: null,
            distance_override: input.distance,
          })
          .eq('id', input.id);
      } else {
        await supabase.from('journeys').insert({
          user_id: userId,
          status: 'completed',
          started_at: startedAt,
          ended_at: endedAt,
          paused_seconds: 0,
          distance_override: input.distance,
        });
      }
      void track(input.id ? 'journey_edited' : 'journey_added', { backdated: true });
      await load();
    },
    [date, entries.journeys, load, userId],
  );

  const remove = useCallback(
    async (table: 'revenues' | 'expenses' | 'journeys', id: string) => {
      await supabase.from(table).delete().eq('id', id);
      void track('entry_deleted', { table });
      await load();
    },
    [load],
  );

  return { entries, loading, refresh: load, saveRevenue, saveExpense, saveJourney, remove };
}
