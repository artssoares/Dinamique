'use server';

import { revalidatePath } from 'next/cache';
import type { InfluencerStatus } from '@dinamique/types';
import { buildReferralCode, generateCodeSuffix, normaliseCode } from '@dinamique/business-logic';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase-server';

/**
 * Approving an influencer creates the influencer record and their code in one
 * go, then notifies them (§78, §79). Every step is audited (§80).
 */
export async function reviewApplication(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);

  const applicationId = String(formData.get('applicationId') ?? '');
  const status = String(formData.get('status') ?? '') as InfluencerStatus;
  const requestedCode = String(formData.get('code') ?? '').trim();
  if (!applicationId || !status) return;

  const supabase = getServiceClient();

  const { data: application } = await supabase
    .from('influencer_applications')
    .select('id, user_id, name, influencer_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (!application) return;

  let influencerId = application.influencer_id as string | null;

  if (status === 'approved') {
    if (!influencerId) {
      const { data: influencer } = await supabase
        .from('influencers')
        .insert({
          user_id: application.user_id,
          display_name: application.name,
          status: 'approved',
          approved_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      influencerId = (influencer?.id as string | undefined) ?? null;
    } else {
      await supabase
        .from('influencers')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', influencerId);
    }

    if (influencerId) {
      const code = requestedCode !== ''
        ? normaliseCode(requestedCode)
        : buildReferralCode(application.name, generateCodeSuffix(2));

      // A duplicate code must fail loudly rather than silently reassign one.
      await supabase.from('promotion_codes').upsert(
        {
          code,
          kind: 'influencer',
          owner_user_id: application.user_id,
          influencer_id: influencerId,
          benefit_amount: 1000,
          created_by_admin_id: admin.userId,
        },
        { onConflict: 'code', ignoreDuplicates: true },
      );
    }
  } else if (influencerId) {
    await supabase.from('influencers').update({ status }).eq('id', influencerId);
  }

  await supabase
    .from('influencer_applications')
    .update({
      status,
      influencer_id: influencerId,
      reviewed_by_admin_id: admin.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', applicationId);

  if (application.user_id) {
    await supabase.from('user_notifications').insert({
      user_id: application.user_id,
      category: 'system',
      title: 'Programa de Influencers',
      body:
        status === 'approved'
          ? 'Você foi aprovado para o programa de Influencers Dinamique.'
          : status === 'rejected'
            ? 'Sua candidatura não foi aprovada desta vez.'
            : 'O status da sua candidatura foi atualizado.',
      deep_link: '/influencer',
    });
  }

  await logAdminAction({
    adminUserId: admin.userId,
    action: `influencer.${status}`,
    targetTable: 'influencer_applications',
    targetId: applicationId,
    metadata: { influencerId },
  });

  revalidatePath('/influencers');
}
