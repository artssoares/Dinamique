'use server';

import { revalidatePath } from 'next/cache';
import { QA_RESULT_STATUSES, type QaResultStatus } from '@dinamique/types';
import { SUPPORT_ROLES, requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase-server';

/**
 * A área de testes.
 *
 * O roteiro (áreas → casos) é editável porque quem testa é quem sabe o que
 * mudou; um roteiro fixo no código envelhece em uma semana e aí ninguém mais
 * olha para ele. A rodada é o que torna isso útil duas vezes: a mesma lista,
 * marcada de novo, antes de cada versão.
 */

function clampPosition(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.min(99_999, Math.round(parsed))) : 0;
}

export async function createSuite(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);

  const name = String(formData.get('name') ?? '').trim();
  if (name === '') return;

  const supabase = getServiceClient();
  await supabase.from('qa_suites').insert({
    name,
    description: String(formData.get('description') ?? '').trim() || null,
    position: clampPosition(formData.get('position')),
  });

  await logAdminAction({ adminUserId: admin.userId, action: 'qa.suite_create', metadata: { name } });
  revalidatePath('/testes');
}

export async function updateSuite(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);

  const id = String(formData.get('id') ?? '');
  if (id === '') return;

  const supabase = getServiceClient();

  if (formData.get('intent') === 'delete') {
    // Apagar uma área leva os casos dela (cascade) e, com eles, os resultados.
    // É por isso que desativar existe: o botão de apagar é para a área criada
    // por engano, não para a que saiu de moda.
    await supabase.from('qa_suites').delete().eq('id', id);
    await logAdminAction({ adminUserId: admin.userId, action: 'qa.suite_delete', targetId: id });
    revalidatePath('/testes');
    return;
  }

  const patch: Record<string, unknown> = {};
  const name = String(formData.get('name') ?? '').trim();
  if (name !== '') patch.name = name;
  if (formData.has('description')) {
    patch.description = String(formData.get('description') ?? '').trim() || null;
  }
  if (formData.has('position')) patch.position = clampPosition(formData.get('position'));
  if (formData.has('isActive')) patch.is_active = formData.get('isActive') === 'true';

  if (Object.keys(patch).length === 0) return;

  await supabase.from('qa_suites').update(patch).eq('id', id);
  await logAdminAction({
    adminUserId: admin.userId,
    action: 'qa.suite_update',
    targetTable: 'qa_suites',
    targetId: id,
    metadata: patch,
  });
  revalidatePath('/testes');
}

export async function createCase(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);

  const suiteId = String(formData.get('suiteId') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  if (suiteId === '' || title === '') return;

  const supabase = getServiceClient();
  await supabase.from('qa_cases').insert({
    suite_id: suiteId,
    title,
    steps: String(formData.get('steps') ?? '').trim() || null,
    expected: String(formData.get('expected') ?? '').trim() || null,
    is_critical: formData.get('isCritical') === 'on',
    position: clampPosition(formData.get('position')),
  });

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'qa.case_create',
    targetTable: 'qa_cases',
    metadata: { suiteId, title },
  });
  revalidatePath('/testes');
}

export async function updateCase(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);

  const id = String(formData.get('id') ?? '');
  if (id === '') return;

  const supabase = getServiceClient();

  if (formData.get('intent') === 'delete') {
    await supabase.from('qa_cases').delete().eq('id', id);
    await logAdminAction({ adminUserId: admin.userId, action: 'qa.case_delete', targetId: id });
    revalidatePath('/testes');
    return;
  }

  const patch: Record<string, unknown> = {};
  const title = String(formData.get('title') ?? '').trim();
  if (title !== '') patch.title = title;
  if (formData.has('steps')) patch.steps = String(formData.get('steps') ?? '').trim() || null;
  if (formData.has('expected')) patch.expected = String(formData.get('expected') ?? '').trim() || null;
  if (formData.has('position')) patch.position = clampPosition(formData.get('position'));
  if (formData.has('isActive')) patch.is_active = formData.get('isActive') === 'true';
  if (formData.has('isCriticalValue')) patch.is_critical = formData.get('isCriticalValue') === 'true';
  if (formData.has('suiteId')) {
    const suiteId = String(formData.get('suiteId') ?? '');
    if (suiteId !== '') patch.suite_id = suiteId;
  }

  if (Object.keys(patch).length === 0) return;

  await supabase.from('qa_cases').update(patch).eq('id', id);
  await logAdminAction({
    adminUserId: admin.userId,
    action: 'qa.case_update',
    targetTable: 'qa_cases',
    targetId: id,
    metadata: patch,
  });
  revalidatePath('/testes');
}

export async function startRun(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);

  const label = String(formData.get('label') ?? '').trim();
  if (label === '') return;

  const supabase = getServiceClient();
  await supabase.from('qa_runs').insert({
    label,
    app_version: String(formData.get('appVersion') ?? '').trim() || null,
    platform: String(formData.get('platform') ?? '').trim() || null,
    started_by: admin.userId,
  });

  await logAdminAction({ adminUserId: admin.userId, action: 'qa.run_start', metadata: { label } });
  revalidatePath('/testes');
}

export async function finishRun(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);

  const id = String(formData.get('id') ?? '');
  if (id === '') return;

  const reopen = formData.get('reopen') === 'true';

  const supabase = getServiceClient();
  await supabase
    .from('qa_runs')
    .update({ finished_at: reopen ? null : new Date().toISOString() })
    .eq('id', id);

  await logAdminAction({
    adminUserId: admin.userId,
    action: reopen ? 'qa.run_reopen' : 'qa.run_finish',
    targetTable: 'qa_runs',
    targetId: id,
  });
  revalidatePath('/testes');
}

export async function deleteRun(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);
  const id = String(formData.get('id') ?? '');
  if (id === '') return;

  const supabase = getServiceClient();
  await supabase.from('qa_runs').delete().eq('id', id);

  await logAdminAction({ adminUserId: admin.userId, action: 'qa.run_delete', targetId: id });
  revalidatePath('/testes');
}

export async function recordResult(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);

  const runId = String(formData.get('runId') ?? '');
  const caseId = String(formData.get('caseId') ?? '');
  const statusRaw = String(formData.get('status') ?? '');

  if (runId === '' || caseId === '') return;

  const supabase = getServiceClient();

  // Rodada encerrada não recebe mais marcação. Uma rodada fechada é o registro
  // do que foi testado naquele dia, e é dela que sai o "dá para publicar?":
  // se desse para marcar depois, o placar de uma rodada antiga mudaria sozinho
  // e o registro deixaria de valer como registro. Para corrigir, reabra a
  // rodada (há botão para isso) — o que fica no log de auditoria.
  const run = await supabase.from('qa_runs').select('finished_at').eq('id', runId).maybeSingle();
  if (!run.data || run.data.finished_at !== null) return;

  // Marcação vazia significa "voltar a não testado", que é diferente de
  // "pulado": pulado é uma decisão, não testado é a ausência dela.
  if (statusRaw === '') {
    await supabase.from('qa_results').delete().eq('run_id', runId).eq('case_id', caseId);
    revalidatePath('/testes');
    return;
  }

  if (!(QA_RESULT_STATUSES as readonly string[]).includes(statusRaw)) return;
  const status = statusRaw as QaResultStatus;

  await supabase.from('qa_results').upsert(
    {
      run_id: runId,
      case_id: caseId,
      status,
      note: String(formData.get('note') ?? '').trim() || null,
      tested_by: admin.userId,
      tested_at: new Date().toISOString(),
    },
    { onConflict: 'run_id,case_id' },
  );

  revalidatePath('/testes');
}
