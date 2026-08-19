import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import { reviewApplication } from './actions';

export const dynamic = 'force-dynamic';

interface ApplicationRow {
  id: string;
  name: string;
  email: string;
  city: string;
  state: string;
  instagram: string | null;
  tiktok: string | null;
  followers_estimate: number | null;
  content_type: string;
  status: string;
  created_at: string;
  influencers: { id: string } | null;
}

/** Influencer applications and their review actions (§80). */
export default async function Influencers() {
  await requireAdmin(PRIVILEGED_ROLES);
  const supabase = await getSessionClient();

  const [applicationsResult, codesResult] = await Promise.all([
    supabase
      .from('influencer_applications')
      .select(
        'id, name, email, city, state, instagram, tiktok, followers_estimate, content_type, status, created_at, influencers(id)',
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('promotion_codes')
      .select('code, influencer_id, use_count')
      .eq('kind', 'influencer'),
  ]);

  const applications = (applicationsResult.data as unknown as ApplicationRow[] | null) ?? [];
  const codes = (codesResult.data as { code: string; influencer_id: string | null; use_count: number }[] | null) ?? [];
  const codeFor = (influencerId: string | null | undefined) =>
    codes.find((c) => c.influencer_id === influencerId);

  return (
    <>
      <h1 className="page-title">Influencers</h1>
      <p className="page-subtitle">{applications.length} candidaturas.</p>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {applications.length === 0 ? (
          <div className="empty">Nenhuma candidatura ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Cidade</th>
                <th>Redes</th>
                <th>Seguidores</th>
                <th>Conteúdo</th>
                <th>Status</th>
                <th>Código</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => {
                const code = codeFor(application.influencers?.id);
                return (
                  <tr key={application.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{application.name}</div>
                      <div className="small muted">{application.email}</div>
                    </td>
                    <td className="small">
                      {application.city}/{application.state}
                    </td>
                    <td className="small">
                      {[application.instagram, application.tiktok].filter(Boolean).join(' · ') || (
                        <span className="muted">–</span>
                      )}
                    </td>
                    <td className="small mono">
                      {application.followers_estimate?.toLocaleString('pt-BR') ?? (
                        <span className="muted">–</span>
                      )}
                    </td>
                    <td className="small">{application.content_type}</td>
                    <td>
                      <span className={`badge ${statusTone(application.status)}`}>
                        {application.status}
                      </span>
                    </td>
                    <td className="small mono">
                      {code ? (
                        <>
                          {code.code}
                          <div className="small muted">{code.use_count} usos</div>
                        </>
                      ) : (
                        <span className="muted">–</span>
                      )}
                    </td>
                    <td>
                      <form action={reviewApplication} style={{ display: 'grid', gap: 6, minWidth: 190 }}>
                        <input type="hidden" name="applicationId" value={application.id} />
                        {application.status !== 'approved' ? (
                          <input
                            className="input"
                            name="code"
                            placeholder="Código (opcional)"
                            aria-label="Código do influencer"
                          />
                        ) : null}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="button" name="status" value="approved" type="submit">
                            Aprovar
                          </button>
                          <button
                            className="button button-ghost"
                            name="status"
                            value="rejected"
                            type="submit"
                          >
                            Recusar
                          </button>
                          <button
                            className="button button-ghost"
                            name="status"
                            value="suspended"
                            type="submit"
                          >
                            Suspender
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function statusTone(status: string): string {
  if (status === 'approved') return 'badge-success';
  if (status === 'rejected' || status === 'suspended') return 'badge-danger';
  return 'badge-brand';
}
