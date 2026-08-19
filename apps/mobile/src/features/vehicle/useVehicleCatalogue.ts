import { useEffect, useState } from 'react';
import type { FuelType, VehicleType } from '@dinamique/types';
import { supabase } from '@/lib/supabase';

/**
 * Catálogo de veículos em três níveis (§32): marca → modelo → versão.
 *
 * Cada nível só carrega depois que o anterior é escolhido, então a lista nunca
 * fica gigante e o app não baixa o catálogo inteiro à toa.
 */

export interface CatalogueItem {
  id: string;
  name: string;
}

export interface VersionItem extends CatalogueItem {
  yearFrom: number | null;
  engine: string | null;
  fuelType: FuelType | null;
  urbanConsumption: number | null;
  highwayConsumption: number | null;
}

export function useMakes(vehicleType: VehicleType | null) {
  const [makes, setMakes] = useState<CatalogueItem[]>([]);

  useEffect(() => {
    if (!vehicleType) {
      setMakes([]);
      return;
    }
    void supabase
      .from('vehicle_models')
      .select('vehicle_makes(id, name)')
      .eq('vehicle_type', vehicleType)
      .eq('is_active', true)
      .then(({ data }) => {
        const rows = (data as { vehicle_makes: CatalogueItem | null }[] | null) ?? [];
        // Um modelo por marca chega várias vezes; dedupe aqui em vez de pedir
        // distinct ao PostgREST, que não expõe isso de forma direta.
        const unique = new Map<string, CatalogueItem>();
        for (const row of rows) {
          if (row.vehicle_makes) unique.set(row.vehicle_makes.id, row.vehicle_makes);
        }
        setMakes([...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      });
  }, [vehicleType]);

  return makes;
}

export function useModels(makeId: string | null, vehicleType: VehicleType | null) {
  const [models, setModels] = useState<CatalogueItem[]>([]);

  useEffect(() => {
    if (!makeId || !vehicleType) {
      setModels([]);
      return;
    }
    void supabase
      .from('vehicle_models')
      .select('id, name')
      .eq('make_id', makeId)
      .eq('vehicle_type', vehicleType)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setModels((data as CatalogueItem[] | null) ?? []));
  }, [makeId, vehicleType]);

  return models;
}

export function useVersions(modelId: string | null) {
  const [versions, setVersions] = useState<VersionItem[]>([]);

  useEffect(() => {
    if (!modelId) {
      setVersions([]);
      return;
    }
    void supabase
      .from('vehicle_versions')
      .select('id, name, year_from, engine, fuel_type, urban_consumption, highway_consumption')
      .eq('model_id', modelId)
      .eq('is_active', true)
      .order('year_from', { ascending: false })
      .then(({ data }) => {
        setVersions(
          ((data as Record<string, any>[] | null) ?? []).map((row) => ({
            id: String(row.id),
            name: row.name ?? '–',
            yearFrom: row.year_from ?? null,
            engine: row.engine ?? null,
            fuelType: row.fuel_type ?? null,
            urbanConsumption: row.urban_consumption ?? null,
            highwayConsumption: row.highway_consumption ?? null,
          })),
        );
      });
  }, [modelId]);

  return versions;
}
