'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase-server';

const CONTENT_ROLES = ['superadmin', 'admin', 'content'] as const;

/**
 * CRUD dos catálogos (§101–105).
 *
 * Uma tabela só é editável aqui se estiver nesta lista. Sem isso, o nome da
 * tabela viria do formulário e qualquer tabela do banco ficaria alcançável.
 */
const EDITABLE_TABLES = [
  'platforms',
  'expense_categories',
  'maintenance_types',
  'support_categories',
  'tour_steps',
] as const;

type EditableTable = (typeof EDITABLE_TABLES)[number];

function assertEditable(value: string): asserts value is EditableTable {
  if (!EDITABLE_TABLES.includes(value as EditableTable)) {
    throw new Error(`Tabela não editável: ${value}`);
  }
}

export async function toggleCatalogueItem(formData: FormData) {
  const admin = await requireAdmin([...CONTENT_ROLES]);

  const table = String(formData.get('table') ?? '');
  const id = String(formData.get('id') ?? '');
  const active = formData.get('active') === 'true';
  assertEditable(table);
  if (!id) return;

  const supabase = getServiceClient();
  await supabase.from(table).update({ is_active: active }).eq('id', id);

  await logAdminAction({
    adminUserId: admin.userId,
    action: active ? 'catalogue.enable' : 'catalogue.disable',
    targetTable: table,
    targetId: id,
  });

  revalidatePath('/catalogos');
}

export async function createCatalogueItem(formData: FormData) {
  const admin = await requireAdmin([...CONTENT_ROLES]);

  const table = String(formData.get('table') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  assertEditable(table);
  if (name === '') return;

  // O slug é derivado do nome, não digitado: é chave técnica e não deve
  // depender de quem preencheu o formulário acertar o formato.
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const payload: Record<string, unknown> = { slug, name, is_active: true };

  if (table === 'expense_categories') {
    payload.is_vehicle_cost = formData.get('isVehicleCost') === 'on';
  }
  if (table === 'tour_steps') {
    payload.title = name;
    payload.description = String(formData.get('description') ?? '').trim();
    delete payload.name;
  }

  const supabase = getServiceClient();
  const { error } = await supabase.from(table).insert(payload);
  if (error) return;

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'catalogue.create',
    targetTable: table,
    targetId: slug,
    metadata: { name },
  });

  revalidatePath('/catalogos');
}

/** Ajuste dos limiares dos insights (§104). */
export async function updateInsightRule(formData: FormData) {
  const admin = await requireAdmin([...CONTENT_ROLES]);

  const key = String(formData.get('key') ?? '');
  const enabled = formData.get('enabled') === 'on';
  const thresholdRaw = String(formData.get('threshold') ?? '').trim();
  if (!key) return;

  const patch: Record<string, unknown> = { is_enabled: enabled, updated_at: new Date().toISOString() };

  if (thresholdRaw !== '') {
    const value = Number(thresholdRaw.replace(',', '.'));
    if (Number.isFinite(value)) {
      const field = key.includes('fuel')
        ? 'fuelShare'
        : key.includes('weekday')
          ? 'weekdayGap'
          : key.includes('streak')
            ? 'goalStreak'
            : 'trendChange';
      patch.thresholds = { [field]: value };
    }
  }

  const supabase = getServiceClient();
  await supabase.from('insight_rules').update(patch).eq('key', key);

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'insight.update',
    targetTable: 'insight_rules',
    targetId: key,
    metadata: patch,
  });

  revalidatePath('/catalogos');
}

/** Importação de veículos por CSV (§32, §101). */
export async function importVehicles(formData: FormData) {
  const admin = await requireAdmin([...CONTENT_ROLES]);

  const csv = String(formData.get('csv') ?? '').trim();
  if (csv === '') return;

  const supabase = getServiceClient();
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '');

  // A primeira linha pode ser cabeçalho; detectamos em vez de exigir.
  const start = /marca|make/i.test(lines[0] ?? '') ? 1 : 0;
  let imported = 0;
  const errors: string[] = [];

  for (let i = start; i < lines.length; i += 1) {
    const [make, model, type, version, year, engine, fuel, urban, highway] =
      lines[i]!.split(/[;,]/).map((cell) => cell.trim());

    if (!make || !model) {
      errors.push(`linha ${i + 1}: marca e modelo são obrigatórios`);
      continue;
    }

    const { data, error } = await supabase.rpc('import_vehicle', {
      p_make: make,
      p_model: model,
      p_type: type || 'car',
      p_version: version || null,
      p_year_from: year ? Number(year) : null,
      p_engine: engine || null,
      p_fuel: fuel || null,
      // O catálogo guarda metros por litro; a planilha traz km/l.
      p_urban: urban ? Math.round(Number(urban.replace(',', '.')) * 1000) : null,
      p_highway: highway ? Math.round(Number(highway.replace(',', '.')) * 1000) : null,
    });

    const result = data as { ok?: boolean; reason?: string } | null;
    if (error) errors.push(`linha ${i + 1}: ${error.message}`);
    else if (result?.ok === false) errors.push(`linha ${i + 1}: ${result.reason}`);
    else imported += 1;
  }

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'vehicles.import',
    targetTable: 'vehicle_versions',
    metadata: { imported, errors: errors.slice(0, 10), total: lines.length - start },
  });

  revalidatePath('/catalogos');
}
