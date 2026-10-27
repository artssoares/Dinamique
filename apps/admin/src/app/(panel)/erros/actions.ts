'use server';

import { revalidatePath } from 'next/cache';
import { APP_ERROR_STATUSES, type AppErrorStatus } from '@dinamique/types';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase-server';

/**
 * Triagem de um erro. Mudar o estado é a única escrita possível aqui — o
 * texto da falha é o que o aplicativo relatou e não se edita, senão o
 * histórico deixaria de ser prova de nada.
 */
export async function setErrorStatus(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);

  const id = Number(formData.get('id') ?? 0);
  const statusRaw = String(formData.get('status') ?? '');
  const note = String(formData.get('note') ?? '').trim() || null;

  if (!Number.isFinite(id) || id <= 0) return;
  if (!(APP_ERROR_STATUSES as readonly string[]).includes(statusRaw)) return;
  const status = statusRaw as AppErrorStatus;

  const supabase = getServiceClient();
  await supabase
    .from('app_errors')
    .update({
      status,
      note,
      resolved_by: status === 'resolved' ? admin.userId : null,
      resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    })
    .eq('id', id);

  await logAdminAction({
    adminUserId: admin.userId,
    action: `error.${status}`,
    targetTable: 'app_errors',
    targetId: String(id),
    metadata: { note },
  });

  revalidatePath('/erros');
  revalidatePath(`/erros/${id}`);
}
