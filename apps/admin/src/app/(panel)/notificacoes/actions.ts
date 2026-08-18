'use server';

import { revalidatePath } from 'next/cache';
import type { NotificationCategory, PlanCode, WorkMode } from '@dinamique/types';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase-server';

/**
 * Composição do público a partir do formulário. Campos vazios viram null, que
 * é como o SQL entende "sem filtro" — uma lista vazia significaria "ninguém".
 */
function buildAudience(formData: FormData) {
  const list = (key: string): string[] | null => {
    const raw = String(formData.get(key) ?? '').trim();
    if (raw === '') return null;
    return raw.split(',').map((item) => item.trim()).filter(Boolean);
  };

  const number = (key: string): number | null => {
    const raw = String(formData.get(key) ?? '').trim();
    if (raw === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };

  return {
    user_ids: null,
    cities: list('cities'),
    states: list('states'),
    work_modes: list('workModes') as WorkMode[] | null,
    plans: list('plans') as PlanCode[] | null,
    active_within_days: number('activeWithin'),
    inactive_for_days: number('inactiveFor'),
  };
}

export async function sendNotification(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);

  const title = String(formData.get('title') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const category = String(formData.get('category') ?? 'news') as NotificationCategory;
  const deepLink = String(formData.get('deepLink') ?? '').trim() || null;
  const ctaLabel = String(formData.get('ctaLabel') ?? '').trim() || null;
  if (title === '' || body === '') return;

  const audience = buildAudience(formData);
  const supabase = getServiceClient();

  const { data: sent } = await supabase.rpc('send_notification', {
    p_audience: audience,
    p_category: category,
    p_title: title,
    p_body: body,
    p_deep_link: deepLink,
    p_cta_label: ctaLabel,
    p_image_path: null,
  });

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'notification.send',
    targetTable: 'user_notifications',
    metadata: { category, title, audience, recipients: sent ?? 0 },
  });

  revalidatePath('/notificacoes');
}
