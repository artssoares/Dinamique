import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface UserRow {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  city: string | null;
  state: string | null;
  work_modes: string[];
  blocked_at: string | null;
  created_at: string;
  last_seen_at: string | null;
}

const ACTIVITY_FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'today', label: 'Acessaram hoje', days: 1 },
  { key: '7d', label: 'Últimos 7 dias', days: 7 },
  { key: '30d', label: 'Últimos 30 dias', days: 30 },
  { key: 'inactive7', label: 'Inativos 7+ dias', inactiveDays: 7 },
  { key: 'inactive30', label: 'Inativos 30+ dias', inactiveDays: 30 },
  { key: 'never', label: 'Nunca retornaram' },
] as const;

/** User list with the activity filters the panel is actually judged on (§83, §84). */
export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; activity?: string; sort?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const search = params.q?.trim() ?? '';
  const activity = params.activity ?? 'all';
  const sort = params.sort ?? 'recent_access';

  const supabase = await getSessionClient();

  let query = supabase
    .from('profiles')
    .select('id, first_name, last_name, email, city, state, work_modes, blocked_at, created_at, last_seen_at')
    .limit(200);

  if (search !== '') {
    query = query.or(`first_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const filter = ACTIVITY_FILTERS.find((f) => f.key === activity);
  const cutoff = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

  if (filter && 'days' in filter && filter.days) {
    query = query.gte('last_seen_at', cutoff(filter.days));
  } else if (filter && 'inactiveDays' in filter && filter.inactiveDays) {
    query = query.lt('last_seen_at', cutoff(filter.inactiveDays));
  } else if (activity === 'never') {
    query = query.is('last_seen_at', null);
  }

  query =
    sort === 'oldest_access'
      ? query.order('last_seen_at', { ascending: true, nullsFirst: true })
      : sort === 'newest'
        ? query.order('created_at', { ascending: false })
        : query.order('last_seen_at', { ascending: false, nullsFirst: false });

  const { data } = await query;
  const users = (data as UserRow[] | null) ?? [];

  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams({ q: search, activity, sort, ...patch });
    return `/usuarios?${next.toString()}`;
  };

  return (
    <>
      <h1 className="page-title">Usuários</h1>
      <p className="page-subtitle">{users.length} usuários nesta visão (máximo 200 por página).</p>

      <form method="get" className="filters">
        <input type="hidden" name="activity" value={activity} />
        <input type="hidden" name="sort" value={sort} />
        <input
          className="input"
          name="q"
          defaultValue={search}
          placeholder="Buscar por nome ou email"
          style={{ maxWidth: 320 }}
          aria-label="Buscar usuários"
        />
        <button type="submit" className="button">
          Buscar
        </button>
      </form>

      <div className="filters">
        {ACTIVITY_FILTERS.map((option) => (
          <Link
            key={option.key}
            href={href({ activity: option.key })}
            className="chip"
            aria-pressed={activity === option.key}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="filters">
        {[
          { key: 'recent_access', label: 'Último acesso ↓' },
          { key: 'oldest_access', label: 'Último acesso ↑' },
          { key: 'newest', label: 'Cadastro mais recente' },
        ].map((option) => (
          <Link
            key={option.key}
            href={href({ sort: option.key })}
            className="chip"
            aria-pressed={sort === option.key}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {users.length === 0 ? (
          <div className="empty">Nenhum usuário encontrado.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Cidade</th>
                <th>Modalidade</th>
                <th>Status</th>
                <th>Cadastro</th>
                <th>Último acesso</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/usuarios/${user.id}`}>
                      {[user.first_name, user.last_name].filter(Boolean).join(' ')}
                    </Link>
                  </td>
                  <td className="small">{user.email}</td>
                  <td className="small">
                    {[user.city, user.state].filter(Boolean).join('/') || <span className="muted">—</span>}
                  </td>
                  <td className="small">
                    {user.work_modes.length > 0 ? user.work_modes.join(', ') : <span className="muted">—</span>}
                  </td>
                  <td>
                    <span className={`badge ${user.blocked_at ? 'badge-danger' : 'badge-success'}`}>
                      {user.blocked_at ? 'Bloqueado' : 'Ativo'}
                    </span>
                  </td>
                  <td className="small mono">
                    {new Date(user.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="small mono">{relativeAccess(user.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/** "há 8 minutos" for recent visits, an absolute date once that stops helping. */
function relativeAccess(value: string | null): string {
  if (!value) return 'nunca';
  const minutes = Math.round((Date.now() - Date.parse(value)) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 1440) return `há ${Math.floor(minutes / 60)} h`;
  if (minutes < 10_080) return `há ${Math.floor(minutes / 1440)} d`;
  return new Date(value).toLocaleDateString('pt-BR');
}
