import { ADMIN_ROLES } from '@dinamique/types';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import { InviteForm } from './InviteForm';
import { changeAdminRole, setAdminActive } from './actions';

export const dynamic = 'force-dynamic';

interface AdminRow {
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
  profiles: { first_name: string; last_name: string | null; email: string; last_seen_at: string | null } | null;
}

const ROLE_SUMMARY: Record<string, string> = {
  superadmin: 'Pode tudo',
  admin: 'Operação e usuários',
  support: 'Só suporte',
  content: 'Só catálogos e textos',
  analyst: 'Só relatórios',
};

/** Quem entra no painel, e com qual alcance (§118). */
export default async function Administrators() {
  const me = await requireAdmin(PRIVILEGED_ROLES);
  const supabase = await getSessionClient();

  const { data } = await supabase
    .from('admin_users')
    .select('user_id, role, is_active, created_at, profiles(first_name, last_name, email, last_seen_at)')
    .order('created_at', { ascending: true });

  const admins = (data as unknown as AdminRow[] | null) ?? [];

  return (
    <>
      <h1 className="page-title">Administradores</h1>
      <p className="page-subtitle">
        {admins.filter((a) => a.is_active).length} pessoas com acesso ao painel.
      </p>

      <InviteForm canCreateSuperadmin={me.role === 'superadmin'} />

      <div className="card" style={{ padding: 0, overflowX: 'auto', marginTop: 16 }}>
        {admins.length === 0 ? (
          <div className="empty">Ninguém tem acesso ao painel ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Email</th>
                <th>Nível</th>
                <th>Situação</th>
                <th>Nível de acesso</th>
                <th>Acesso</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((row) => {
                const isMe = row.user_id === me.userId;
                return (
                  <tr key={row.user_id}>
                    <td style={{ fontWeight: 600 }}>
                      {[row.profiles?.first_name, row.profiles?.last_name].filter(Boolean).join(' ') || '–'}
                      {isMe ? <span className="small muted"> (você)</span> : null}
                    </td>
                    <td className="small">{row.profiles?.email ?? '–'}</td>
                    <td className="small">
                      <span className="badge badge-neutral">{row.role}</span>
                      <div className="small muted">{ROLE_SUMMARY[row.role] ?? ''}</div>
                    </td>
                    <td>
                      <span className={`badge ${row.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {row.is_active ? 'Ativo' : 'Sem acesso'}
                      </span>
                    </td>
                    <td>
                      {isMe ? (
                        <span className="small muted">
                          Ninguém altera o próprio acesso — nem para subir, nem para se trancar fora.
                        </span>
                      ) : (
                        <form action={changeAdminRole} style={{ display: 'flex', gap: 8 }}>
                          <input type="hidden" name="userId" value={row.user_id} />
                          <select className="input" name="role" defaultValue={row.role} aria-label="Nível">
                            {ADMIN_ROLES.filter(
                              (role) => role !== 'superadmin' || me.role === 'superadmin',
                            ).map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="button button-ghost">
                            Salvar
                          </button>
                        </form>
                      )}
                    </td>
                    <td>
                      {isMe ? (
                        <span className="small muted">–</span>
                      ) : (
                        <form action={setAdminActive}>
                          <input type="hidden" name="userId" value={row.user_id} />
                          <input type="hidden" name="active" value={row.is_active ? 'false' : 'true'} />
                          <button type="submit" className="button button-ghost">
                            {row.is_active ? 'Remover acesso' : 'Devolver acesso'}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="small muted" style={{ marginTop: 16, maxWidth: 640 }}>
        Remover o acesso não apaga a conta nem o histórico: a pessoa continua usando o aplicativo
        normalmente e o Audit Log continua sabendo quem fez o quê.
      </p>
    </>
  );
}
