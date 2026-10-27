import Link from 'next/link';
import { describeErrorStatus, describeWhen, errorPriority } from '@dinamique/business-logic';
import type { AppErrorSeverity, AppErrorStatus } from '@dinamique/types';
import { requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface ErrorRow {
  id: number;
  severity: AppErrorSeverity;
  source: string;
  title: string;
  screen: string | null;
  platform: string | null;
  app_version: string | null;
  occurrences: number;
  status: AppErrorStatus;
  first_seen_at: string;
  last_seen_at: string;
}

const STATUS_FILTERS = [
  { key: 'open', label: 'Em aberto' },
  { key: 'new', label: 'Novos' },
  { key: 'investigating', label: 'Investigando' },
  { key: 'resolved', label: 'Resolvidos' },
  { key: 'ignored', label: 'Ignorados' },
  { key: 'all', label: 'Tudo' },
] as const;

const SEVERITY_BADGE: Record<AppErrorSeverity, string> = {
  fatal: 'badge-danger',
  error: 'badge-warning',
  warning: 'badge-neutral',
};

const SEVERITY_WORD: Record<AppErrorSeverity, string> = {
  fatal: 'Travou o app',
  error: 'Impediu a ação',
  warning: 'Incomodou',
};

/**
 * Central de erros. Uma linha por problema, não por ocorrência: uma tela que
 * quebra para duzentos motoristas é um problema com duzentas ocorrências, e
 * uma lista de duzentas linhas iguais esconde exatamente isso.
 */
export default async function Errors({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status = params.status ?? 'open';

  const supabase = await getSessionClient();

  let query = supabase
    .from('app_errors')
    .select('id, severity, source, title, screen, platform, app_version, occurrences, status, first_seen_at, last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(300);

  if (status === 'open') query = query.in('status', ['new', 'investigating']);
  else if (status !== 'all') query = query.eq('status', status);

  const [errors, impact] = await Promise.all([
    query,
    supabase.from('app_error_impact').select('error_id, affected_users'),
  ]);

  const rows = ((errors.data as ErrorRow[] | null) ?? []).sort(
    (a, b) => errorPriority(b) - errorPriority(a),
  );

  const affected = new Map(
    ((impact.data as { error_id: number; affected_users: number }[] | null) ?? []).map((row) => [
      row.error_id,
      row.affected_users,
    ]),
  );

  return (
    <>
      <h1 className="page-title">Erros</h1>
      <p className="page-subtitle">
        {rows.length === 0
          ? 'Nenhum problema nesta visão.'
          : `${rows.length} problemas nesta visão, os mais graves primeiro.`}
      </p>

      <div className="filters">
        {STATUS_FILTERS.map((option) => (
          <Link
            key={option.key}
            href={`/erros?status=${option.key}`}
            className="chip"
            aria-pressed={status === option.key}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {rows.length === 0 ? (
          <div className="empty">
            Nada aqui. Ou o aplicativo está indo bem, ou nenhuma versão com o envio de erros está
            publicada ainda.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Gravidade</th>
                <th>O que aconteceu</th>
                <th>Onde</th>
                <th>Vezes</th>
                <th>Pessoas</th>
                <th>Última vez</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <span className={`badge ${SEVERITY_BADGE[row.severity]}`}>
                      {SEVERITY_WORD[row.severity]}
                    </span>
                  </td>
                  <td style={{ maxWidth: 420 }}>
                    <Link href={`/erros/${row.id}`} style={{ fontWeight: 600 }}>
                      {row.title}
                    </Link>
                    <div className="small muted">
                      {row.source === 'mobile' ? 'aplicativo' : row.source === 'admin' ? 'painel' : 'servidor'}
                      {row.app_version ? ` · versão ${row.app_version}` : ''}
                      {row.platform ? ` · ${row.platform}` : ''}
                    </div>
                  </td>
                  <td className="small mono">{row.screen ?? '–'}</td>
                  <td className="small mono">{row.occurrences}</td>
                  <td className="small mono">{affected.get(row.id) ?? 0}</td>
                  <td className="small mono">{describeWhen(row.last_seen_at)}</td>
                  <td>
                    <span
                      className={`badge ${
                        row.status === 'resolved'
                          ? 'badge-success'
                          : row.status === 'ignored'
                            ? 'badge-neutral'
                            : 'badge-warning'
                      }`}
                    >
                      {describeErrorStatus(row.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="small muted" style={{ marginTop: 16, maxWidth: 640 }}>
        Abra um problema para ver o palpite do que aconteceu e o prompt pronto para investigar. Um
        erro marcado como resolvido que volta a acontecer reabre sozinho.
      </p>
    </>
  );
}
