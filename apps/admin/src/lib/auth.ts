import { redirect } from 'next/navigation';
import type { AdminRole } from '@dinamique/types';
import { getSessionClient } from './supabase-server';

export interface AdminIdentity {
  userId: string;
  email: string;
  name: string;
  role: AdminRole;
}

/**
 * Server-side gate for every admin page (§81, §118).
 *
 * Authorisation is never inferred from the client. The role is read from
 * `admin_users` on each request, so revoking access takes effect immediately
 * rather than when a token expires.
 */
export async function requireAdmin(allowed?: AdminRole[]): Promise<AdminIdentity> {
  const supabase = await getSessionClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) redirect('/login');

  const { data } = await supabase
    .from('admin_users')
    .select('role, is_active, profiles(first_name, email)')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (!data || !data.is_active) redirect('/sem-acesso');

  const role = data.role as AdminRole;
  if (allowed && !allowed.includes(role)) redirect('/sem-acesso');

  const profile = data.profiles as { first_name?: string; email?: string } | null;

  return {
    userId: auth.user.id,
    email: profile?.email ?? auth.user.email ?? '',
    name: profile?.first_name ?? '',
    role,
  };
}

/** Roles allowed to act on support tickets. */
export const SUPPORT_ROLES: AdminRole[] = ['superadmin', 'admin', 'support'];

/** Roles allowed to grant plans, promote admins and export user data. */
export const PRIVILEGED_ROLES: AdminRole[] = ['superadmin', 'admin'];
