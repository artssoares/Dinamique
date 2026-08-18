import { formatCents } from '@dinamique/utils';
import { requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface ReferralRow {
  id: string;
  status: string;
  created_at: string;
  referrer: { first_name: string; email: string } | null;
  referred: { first_name: string; email: string; city: string | null } | null;
  promotion_codes: { code: string } | null;
}

/** Referral tracking (§87). */
export default async function Referrals() {
  await requireAdmin();
  const supabase = await getSessionClient();

  const [referralsResult, benefitsResult] = await Promise.all([
    supabase
      .from('referrals')
      .select(
        'id, status, created_at, ' +
          'referrer:profiles!referrals_referrer_user_id_fkey(first_name, email), ' +
          'referred:profiles!referrals_referred_user_id_fkey(first_name, email, city), ' +
          'promotion_codes(code)',
      )
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('discount_benefits').select('amount, status'),
  ]);

  const referrals = (referralsResult.data as unknown as ReferralRow[] | null) ?? [];
  const benefits = (benefitsResult.data as { amount: number; status: string }[] | null) ?? [];

  const granted = benefits.reduce((acc, b) => acc + b.amount, 0);
  const used = benefits.filter((b) => b.status === 'used').reduce((acc, b) => acc + b.amount, 0);

  const stats = [
    { label: 'Indicações', value: String(referrals.length) },
    { label: 'Convertidos para Pro', value: String(referrals.filter((r) => r.status === 'converted').length) },
    { label: 'Descontos concedidos', value: formatCents(granted) },
    { label: 'Descontos utilizados', value: formatCents(used) },
  ];

  return (
    <>
      <h1 className="page-title">Indicações</h1>
      <p className="page-subtitle">Quem indicou quem, e o que já foi concedido.</p>

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {stats.map((stat) => (
          <div key={stat.label} className="card">
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value mono">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {referrals.length === 0 ? (
          <div className="empty">Nenhuma indicação registrada ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Indicador</th>
                <th>Indicado</th>
                <th>Código</th>
                <th>Cidade</th>
                <th>Status</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {referrals.map((referral) => (
                <tr key={referral.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{referral.referrer?.first_name ?? '—'}</div>
                    <div className="small muted">{referral.referrer?.email}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{referral.referred?.first_name ?? '—'}</div>
                    <div className="small muted">{referral.referred?.email}</div>
                  </td>
                  <td className="small mono">{referral.promotion_codes?.code ?? '—'}</td>
                  <td className="small">{referral.referred?.city ?? <span className="muted">—</span>}</td>
                  <td>
                    <span className={`badge ${referral.status === 'converted' ? 'badge-success' : 'badge-neutral'}`}>
                      {referral.status}
                    </span>
                  </td>
                  <td className="small mono">
                    {new Date(referral.created_at).toLocaleDateString('pt-BR')}
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
