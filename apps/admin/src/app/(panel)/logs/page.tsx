import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface LogRow {
  id: string;
  action: string;
  target_table: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  profiles: { first_name: string; email: string } | null;
}

/** Audit log (§109). Read-only by construction — there is no delete path. */
export default async function AuditLog() {
  await requireAdmin(PRIVILEGED_ROLES);
  const supabase = await getSessionClient();

  const { data } = await supabase
    .from('admin_logs')
    .select('id, action, target_table, target_id, metadata, created_at, profiles(first_name, email)')
    .order('created_at', { ascending: false })
    .limit(200);

  const logs = (data as unknown as LogRow[] | null) ?? [];

  return (
    <>
      <h1 className="page-title">Audit Log</h1>
      <p className="page-subtitle">Últimas 200 ações administrativas.</p>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {logs.length === 0 ? (
          <div className="empty">Nenhuma ação registrada ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Admin</th>
                <th>Ação</th>
                <th>Alvo</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="small mono">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                  <td className="small">{log.profiles?.first_name ?? '—'}</td>
                  <td className="small mono">{log.action}</td>
                  <td className="small mono">
                    {log.target_table ? `${log.target_table}:${log.target_id ?? ''}` : '—'}
                  </td>
                  <td className="small mono muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {Object.keys(log.metadata ?? {}).length > 0 ? JSON.stringify(log.metadata) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
