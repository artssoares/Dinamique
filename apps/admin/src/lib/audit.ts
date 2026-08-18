import { getServiceClient } from './supabase-server';

/**
 * Audit log (§109). Every privileged action records who did what to whom.
 * Called from Server Actions after the change succeeds, so a failed write is
 * never logged as if it happened.
 */
export async function logAdminAction(input: {
  adminUserId: string;
  action: string;
  targetTable?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from('admin_logs').insert({
    admin_user_id: input.adminUserId,
    action: input.action,
    target_table: input.targetTable ?? null,
    target_id: input.targetId ?? null,
    metadata: input.metadata ?? {},
  });
}
