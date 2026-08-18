'use server';

import { revalidatePath } from 'next/cache';
import type { AdminRole, PlanSource } from '@dinamique/types';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase-server';

/**
 * Ações sobre a conta de um usuário.
 *
 * Todas exigem papel privilegiado e todas gravam Audit Log — conceder plano,
 * bloquear conta e promover admin são exatamente as ações que precisam ser
 * explicáveis depois (§109).
 */

export async function grantPlan(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);

  const userId = String(formData.get('userId') ?? '');
  const source = String(formData.get('source') ?? 'courtesy') as PlanSource;
  const daysRaw = String(formData.get('days') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim() || null;
  if (!userId) return;

  // Sem prazo significa acesso aberto; com prazo, conta a partir de agora.
  const days = daysRaw === '' ? null : Number(daysRaw);
  const expiresAt =
    days !== null && Number.isFinite(days) && days > 0
      ? new Date(Date.now() + days * 86_400_000).toISOString()
      : null;

  const supabase = getServiceClient();
  await supabase.from('subscriptions').insert({
    user_id: userId,
    plan: 'pro',
    source,
    started_at: new Date().toISOString(),
    expires_at: expiresAt,
    granted_by_admin_id: admin.userId,
    note,
  });

  await supabase.from('user_notifications').insert({
    user_id: userId,
    category: 'subscription',
    title: 'Você tem o Dinamique Pro',
    body: expiresAt
      ? `Seu acesso Pro está liberado por ${days} dias.`
      : 'Seu acesso Pro foi liberado.',
    deep_link: '/plan',
  });

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'plan.grant',
    targetTable: 'profiles',
    targetId: userId,
    metadata: { source, days, note },
  });

  revalidatePath(`/usuarios/${userId}`);
}

export async function revokePlan(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);
  const userId = String(formData.get('userId') ?? '');
  const grantId = String(formData.get('grantId') ?? '');
  if (!userId || !grantId) return;

  const supabase = getServiceClient();
  // Cancelamos em vez de apagar: o histórico de concessões precisa sobreviver.
  await supabase
    .from('subscriptions')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('id', grantId);

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'plan.revoke',
    targetTable: 'subscriptions',
    targetId: grantId,
    metadata: { userId },
  });

  revalidatePath(`/usuarios/${userId}`);
}

export async function toggleBlock(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);
  const userId = String(formData.get('userId') ?? '');
  const block = formData.get('block') === 'true';
  if (!userId) return;

  const supabase = getServiceClient();
  await supabase
    .from('profiles')
    .update({ blocked_at: block ? new Date().toISOString() : null })
    .eq('id', userId);

  await logAdminAction({
    adminUserId: admin.userId,
    action: block ? 'user.block' : 'user.unblock',
    targetTable: 'profiles',
    targetId: userId,
  });

  revalidatePath(`/usuarios/${userId}`);
}

export async function setAdminRole(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);

  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '') as AdminRole | '';
  if (!userId) return;

  // Ninguém pode alterar o próprio acesso administrativo — nem para promover,
  // nem para se trancar fora por engano.
  if (userId === admin.userId) return;

  // Só um superadmin cria outro superadmin.
  if (role === 'superadmin' && admin.role !== 'superadmin') return;

  const supabase = getServiceClient();

  if (role === '') {
    await supabase.from('admin_users').update({ is_active: false }).eq('user_id', userId);
  } else {
    await supabase
      .from('admin_users')
      .upsert(
        { user_id: userId, role, is_active: true, created_by: admin.userId },
        { onConflict: 'user_id' },
      );
  }

  await logAdminAction({
    adminUserId: admin.userId,
    action: role === '' ? 'admin.remove' : 'admin.grant',
    targetTable: 'admin_users',
    targetId: userId,
    metadata: { role },
  });

  revalidatePath(`/usuarios/${userId}`);
}
