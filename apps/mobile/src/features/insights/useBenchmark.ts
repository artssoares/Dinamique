import { useEffect, useState } from 'react';
import type { Cents } from '@dinamique/types';
import { compareToBenchmark, type BenchmarkComparison } from '@dinamique/business-logic';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/hooks/useSession';

export interface BenchmarkView {
  comparison: BenchmarkComparison;
  scope: string;
}

/**
 * Benchmark anônimo (§44).
 *
 * Tenta a cidade primeiro e cai para o nacional. Se nenhum dos dois tiver
 * amostra suficiente, retorna null e a tela simplesmente não mostra a seção —
 * nunca um número aproximado com aviso.
 */
export function useBenchmark(userRevenuePerKm: Cents | null): BenchmarkView | null {
  const { session, profile } = useSession();
  const [result, setResult] = useState<BenchmarkView | null>(null);

  useEffect(() => {
    if (!session?.user || userRevenuePerKm === null) {
      setResult(null);
      return;
    }

    const workMode = profile?.workModes[0] ?? 'rideshare';

    void (async () => {
      const { data: cityRows } = await supabase
        .from('benchmark_buckets')
        .select('city, sample_size, median_revenue_per_km, median_profit_per_hour')
        .eq('work_mode', workMode)
        .limit(20);

      // O agregado da própria cidade é o mais útil; sem ele, o nacional serve.
      const city = ((cityRows as Record<string, any>[] | null) ?? []).find(
        (row) => row.city === profile?.city,
      );

      if (city) {
        const comparison = compareToBenchmark({
          userValue: userRevenuePerKm,
          bucket: {
            sampleSize: city.sample_size,
            medianRevenuePerKm: city.median_revenue_per_km,
            medianProfitPerHour: city.median_profit_per_hour,
          },
          metric: 'revenuePerKm',
        });
        if (comparison) {
          setResult({ comparison, scope: `motoristas parecidos em ${city.city}` });
          return;
        }
      }

      const { data: nationalRows } = await supabase
        .from('benchmark_national')
        .select('sample_size, median_revenue_per_km, median_profit_per_hour')
        .eq('work_mode', workMode)
        .maybeSingle();

      if (nationalRows) {
        const comparison = compareToBenchmark({
          userValue: userRevenuePerKm,
          bucket: {
            sampleSize: (nationalRows as Record<string, any>).sample_size,
            medianRevenuePerKm: (nationalRows as Record<string, any>).median_revenue_per_km,
            medianProfitPerHour: (nationalRows as Record<string, any>).median_profit_per_hour,
          },
          metric: 'revenuePerKm',
        });
        if (comparison) {
          setResult({ comparison, scope: 'motoristas parecidos no Brasil' });
          return;
        }
      }

      setResult(null);
    })();
  }, [session?.user?.id, profile?.city, profile?.workModes, userRevenuePerKm]);

  return result;
}
