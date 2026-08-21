import type { DateOnly } from '@dinamique/types';
import type { ExportData } from '@dinamique/exports';
import { supabase } from '@/lib/supabase';

/**
 * Busca no banco tudo que entra na exportação de um período (§55).
 *
 * As consultas são paralelas e cada uma traz só as colunas usadas – uma
 * exportação de um ano inteiro em rede móvel não pode baixar o banco todo.
 */
export async function collectExportData(
  userId: string,
  period: { start: DateOnly; end: DateOnly },
): Promise<ExportData> {
  const [daily, journeys, revenues, expenses, fuel, maintenance] = await Promise.all([
    supabase
      .from('daily_totals')
      .select('date, gross_revenue, total_expenses, net_profit, worked_seconds, distance, trip_count')
      .eq('user_id', userId)
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date'),
    supabase
      .from('journeys')
      .select('started_at, ended_at, paused_seconds, odometer_start, odometer_end, distance_override')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('started_at', `${period.start}T00:00:00`)
      .lte('started_at', `${period.end}T23:59:59`)
      .order('started_at'),
    supabase
      .from('revenues')
      .select('date, amount, tips, trip_count, quantity, note, platforms(name), products(name)')
      .eq('user_id', userId)
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date'),
    supabase
      .from('expenses')
      .select('date, amount, note, expense_categories(name)')
      .eq('user_id', userId)
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date'),
    supabase
      .from('fuel_logs')
      .select('date, fuel_type, total_amount, price_per_litre, volume, odometer, station')
      .eq('user_id', userId)
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date'),
    supabase
      .from('maintenance_logs')
      .select('date, amount, odometer, note, maintenance_types(name)')
      .eq('user_id', userId)
      .gte('date', period.start)
      .lte('date', period.end)
      .order('date'),
  ]);

  const rows = <T,>(result: { data: unknown }) => ((result.data as T[] | null) ?? []);

  return {
    period,
    daily: rows<Record<string, any>>(daily).map((row) => ({
      date: row.date,
      grossRevenue: row.gross_revenue,
      totalExpenses: row.total_expenses,
      netProfit: row.net_profit,
      workedSeconds: row.worked_seconds,
      distance: row.distance,
      tripCount: row.trip_count,
    })),
    journeys: rows<Record<string, any>>(journeys).map((row) => ({
      startedAt: row.started_at,
      endedAt: row.ended_at,
      workedSeconds: row.ended_at
        ? Math.max(
            0,
            Math.round((Date.parse(row.ended_at) - Date.parse(row.started_at)) / 1000) -
              (row.paused_seconds ?? 0),
          )
        : 0,
      distance:
        row.distance_override ??
        (row.odometer_end !== null && row.odometer_start !== null
          ? row.odometer_end - row.odometer_start
          : null),
    })),
    revenues: rows<Record<string, any>>(revenues).map((row) => ({
      date: row.date,
      // A sale has no platform, so the product stands in its place. A blank
      // cell in a spreadsheet is a question nobody can answer later.
      platform:
        row.platforms?.name ??
        (row.products?.name
          ? `Venda: ${row.products.name}${row.quantity ? ` (${row.quantity})` : ''}`
          : null),
      amount: row.amount,
      tips: row.tips,
      tripCount: row.trip_count,
      note: row.note,
    })),
    expenses: rows<Record<string, any>>(expenses).map((row) => ({
      date: row.date,
      category: row.expense_categories?.name ?? 'Outros',
      amount: row.amount,
      note: row.note,
    })),
    fuel: rows<Record<string, any>>(fuel).map((row) => ({
      date: row.date,
      fuelType: row.fuel_type,
      totalAmount: row.total_amount,
      pricePerLitre: row.price_per_litre,
      volume: row.volume,
      odometer: row.odometer,
      station: row.station,
    })),
    maintenance: rows<Record<string, any>>(maintenance).map((row) => ({
      date: row.date,
      type: row.maintenance_types?.name ?? 'Manutenção',
      amount: row.amount,
      odometer: row.odometer,
      note: row.note,
    })),
  };
}
