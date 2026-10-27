import Link from 'next/link';
import { describeActivity, describeActivitySource, describeWhen } from '@dinamique/business-logic';
import { requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface FeedRow {
  kind: 'event' | 'account' | 'plan' | 'error';
  at: string;
  user_id: string | null;
  code: string;
  detail: Record<string, unknown>;
  platform: string | null;
  app_version: string | null;
}

const KIND_FILTERS = [
  { key: 'all', label: 'Tudo' },
  { key: 'event', label: 'Uso do app' },
  { key: 'account', label: 'Contas novas' },
  { key: 'plan', label: 'Planos' },
  { key: 'error', label: 'Erros' },
] as const;

const WINDOWS = [
  { key: '1', label: 'Hoje' },
  { key: '7', label: '7 dias' },
  { key: '30', label: '30 dias' },
  { key: 'all', label: 'Tudo' },
] as const;

/**
 * Linha do tempo de tudo o que os usuários fizeram, em frases.
 *
 * O painel já tinha números (Analytics) e fichas (Usuários). O que faltava era
 * a pergunta do meio: "o que andou acontecendo?". Uma tabela de códigos de
 * evento não responde isso para quem não escreveu os códigos, então cada linha
 * aqui é uma frase em português – a tradução vive em @dinamique/business-logic,
 * onde é testada.
 */
export default async function Activities({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; days?: string; user?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const kind = params.kind ?? 'all';
  const days = params.days ?? '7';
  const user = params.user ?? '';

  const supabase = await getSessionClient();

  let query = supabase
    .from('admin_activity_feed')
    .select('kind, at, user_id, code, detail, platform, app_version')
    .order('at', { ascending: false })
    .limit(300);

  if (kind !== 'all') query = query.eq('kind', kind);
  if (user !== '') query = query.eq('user_id', user);
  if (days !== 'all') {
    query = query.gte('at', new Date(Date.now() - Number(days) * 86_400_000).toISOString());
  }

  const [feed, people] = await Promise.all([
    query,
    supabase.from('profiles').select('id, first_name, last_name, email').limit(1000),
  ]);

  const rows = (feed.data as FeedRow[] | null) ?? [];
  const names = new Map(
    ((people.data as { id: string; first_name: string; last_name: string | null; email: string }[] | null) ?? []).map(
      (p) => [p.id, { name: [p.first_name, p.last_name].filter(Boolean).join(' '), email: p.email }],
    ),
  );

  const href = (patch: Record<string, string>) =>
    `/atividades?${new URLSearchParams({ kind, days, user, ...patch }).toString()}`;

  const focused = user === '' ? null : names.get(user);

  return (
    <>
      <h1 className="page-title">Atividades</h1>
      <p className="page-subtitle">
        {focused
          ? `O que ${focused.name || focused.email} fez, do mais recente para o mais antigo.`
          : 'O que os usuários fizeram, do mais recente para o mais antigo.'}
      </p>

      {focused ? (
        <div className="filters">
          <Link href={href({ user: '' })} className="chip">
            ← Ver todos os usuários
          </Link>
          <Link href={`/usuarios/${user}`} className="chip">
            Abrir a ficha desta pessoa
          </Link>
        </div>
      ) : null}

      <div className="filters">
        {KIND_FILTERS.map((option) => (
          <Link
            key={option.key}
            href={href({ kind: option.key })}
            className="chip"
            aria-pressed={kind === option.key}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="filters">
        {WINDOWS.map((option) => (
          <Link
            key={option.key}
            href={href({ days: option.key })}
            className="chip"
            aria-pressed={days === option.key}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {rows.length === 0 ? (
          <div className="empty">
            Nada neste período. Troque o filtro de tempo, ou espere o aplicativo ser usado.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row, index) => {
              const who = row.user_id === null ? null : names.get(row.user_id);
              const label = who?.name || who?.email || 'Alguém sem conta (ainda não entrou)';
              const source = describeActivitySource({
                platform: row.platform,
                appVersion: row.app_version,
              });
              const errorId = row.kind === 'error' ? Number(row.detail?.error_id ?? 0) : 0;

              return (
                <li
                  key={`${row.at}-${row.code}-${index}`}
                  style={{
                    padding: '12px 16px',
                    borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                    display: 'flex',
                    gap: 12,
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="small mono muted" style={{ minWidth: 92 }}>
                    {describeWhen(row.at)}
                  </span>

                  <span style={{ flex: 1, minWidth: 260 }}>
                    {row.user_id === null ? (
                      <strong>{label}</strong>
                    ) : (
                      <Link href={href({ user: row.user_id })} style={{ fontWeight: 600 }}>
                        {label}
                      </Link>
                    )}{' '}
                    {describeActivity({ code: row.code, detail: row.detail ?? {} })}
                    {source === '' ? null : <span className="small muted"> · {source}</span>}
                  </span>

                  {errorId > 0 ? (
                    <Link href={`/erros/${errorId}`} className="badge badge-danger">
                      ver o erro
                    </Link>
                  ) : null}

                  <span className="small mono muted">
                    {new Date(row.at).toLocaleString('pt-BR')}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="small muted" style={{ marginTop: 16, maxWidth: 640 }}>
        Mostramos as 300 linhas mais recentes do período escolhido. Clique no nome de alguém para
        ver só o que aquela pessoa fez.
      </p>
    </>
  );
}
