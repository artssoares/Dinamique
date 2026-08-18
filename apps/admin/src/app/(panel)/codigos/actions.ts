'use server';

import { revalidatePath } from 'next/cache';
import { normaliseCode } from '@dinamique/business-logic';
import { parseCents } from '@dinamique/utils';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase-server';

export async function createCode(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);

  const code = normaliseCode(String(formData.get('code') ?? ''));
  const kind = String(formData.get('kind') ?? 'campaign');
  const benefit = parseCents(String(formData.get('benefit') ?? '0')) ?? 0;
  const maxUsesRaw = String(formData.get('maxUses') ?? '').trim();
  const expiresRaw = String(formData.get('expiresAt') ?? '').trim();

  if (code.length < 4) return;

  const supabase = getServiceClient();
  const { error } = await supabase.from('promotion_codes').insert({
    code,
    kind,
    benefit_amount: benefit,
    max_uses: maxUsesRaw === '' ? null : Number(maxUsesRaw),
    // A date-only input means "valid through that whole day".
    expires_at: expiresRaw === '' ? null : new Date(`${expiresRaw}T23:59:59`).toISOString(),
    created_by_admin_id: admin.userId,
  });
  if (error) return;

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'code.create',
    targetTable: 'promotion_codes',
    targetId: code,
    metadata: { kind, benefit },
  });

  revalidatePath('/codigos');
}

export async function toggleCode(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);
  const codeId = String(formData.get('codeId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (!codeId || !['active', 'inactive'].includes(status)) return;

  const supabase = getServiceClient();
  await supabase.from('promotion_codes').update({ status }).eq('id', codeId);

  await logAdminAction({
    adminUserId: admin.userId,
    action: `code.${status}`,
    targetTable: 'promotion_codes',
    targetId: codeId,
  });

  revalidatePath('/codigos');
}
