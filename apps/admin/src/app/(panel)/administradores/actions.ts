'use server';

import { revalidatePath } from 'next/cache';
import { ADMIN_ROLES, type AdminRole } from '@dinamique/types';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase-server';

/**
 * Quem pode entrar no painel.
 *
 * As três travas estão todas no servidor, porque uma Server Action é um
 * endpoint público e esconder o formulário não é autorização:
 *
 *   1. ninguém mexe no próprio acesso – nem para subir de papel, nem para se
 *      trancar fora por engano;
 *   2. só um superadmin cria ou remove outro superadmin;
 *   3. a conta tem de existir. Não criamos login aqui: a pessoa se cadastra
 *      pelo aplicativo, como qualquer um, e aí recebe o papel. Criar a conta
 *      daqui significaria o painel escolhendo a senha de alguém.
 */

export interface AdminActionResult {
  ok: boolean;
  message: string;
}

function isRole(value: string): value is AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(value);
}

export async function inviteAdmin(
  _previous: AdminActionResult | null,
  formData: FormData,
): Promise<AdminActionResult> {
  const admin = await requireAdmin(PRIVILEGED_ROLES);

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const roleRaw = String(formData.get('role') ?? '');

  if (email === '') return { ok: false, message: 'Informe o email da pessoa.' };
  if (!isRole(roleRaw)) return { ok: false, message: 'Escolha um nível de acesso.' };
  if (roleRaw === 'superadmin' && admin.role !== 'superadmin') {
    return { ok: false, message: 'Só um superadmin pode criar outro superadmin.' };
  }

  const supabase = getServiceClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name')
    .eq('email', email)
    .maybeSingle();

  if (!profile) {
    return {
      ok: false,
      message: `Ninguém com o email ${email} tem conta no Dinamique ainda. Peça para a pessoa se cadastrar no aplicativo e volte aqui — o acesso de admin é dado a uma conta que já existe.`,
    };
  }

  const target = profile as { id: string; first_name: string };

  if (target.id === admin.userId) {
    return { ok: false, message: 'Você não pode alterar o seu próprio acesso.' };
  }

  const { error } = await supabase
    .from('admin_users')
    .upsert(
      { user_id: target.id, role: roleRaw, is_active: true, created_by: admin.userId },
      { onConflict: 'user_id' },
    );

  if (error) return { ok: false, message: `Não deu para salvar: ${error.message}` };

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'admin.grant',
    targetTable: 'admin_users',
    targetId: target.id,
    metadata: { email, role: roleRaw },
  });

  revalidatePath('/administradores');
  return {
    ok: true,
    message: `${target.first_name} (${email}) agora entra no painel como ${roleRaw}.`,
  };
}

export async function changeAdminRole(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);

  const userId = String(formData.get('userId') ?? '');
  const roleRaw = String(formData.get('role') ?? '');
  if (userId === '' || !isRole(roleRaw)) return;
  if (userId === admin.userId) return;
  if (roleRaw === 'superadmin' && admin.role !== 'superadmin') return;

  const supabase = getServiceClient();

  // Rebaixar um superadmin também é coisa de superadmin: do contrário um admin
  // comum removeria o dono do painel.
  const { data: current } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if ((current as { role: string } | null)?.role === 'superadmin' && admin.role !== 'superadmin') {
    return;
  }

  await supabase.from('admin_users').update({ role: roleRaw }).eq('user_id', userId);

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'admin.role_change',
    targetTable: 'admin_users',
    targetId: userId,
    metadata: { role: roleRaw },
  });

  revalidatePath('/administradores');
}

export async function setAdminActive(formData: FormData) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);

  const userId = String(formData.get('userId') ?? '');
  const active = formData.get('active') === 'true';
  if (userId === '' || userId === admin.userId) return;

  const supabase = getServiceClient();

  const { data: current } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if ((current as { role: string } | null)?.role === 'superadmin' && admin.role !== 'superadmin') {
    return;
  }

  // Desativamos em vez de apagar: o Audit Log aponta para esta linha, e um
  // delete deixaria o histórico sem autor.
  await supabase.from('admin_users').update({ is_active: active }).eq('user_id', userId);

  await logAdminAction({
    adminUserId: admin.userId,
    action: active ? 'admin.reactivate' : 'admin.deactivate',
    targetTable: 'admin_users',
    targetId: userId,
  });

  revalidatePath('/administradores');
}
