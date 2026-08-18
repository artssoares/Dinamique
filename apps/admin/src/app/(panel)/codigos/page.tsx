import { formatCents } from '@dinamique/utils';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import { createCode, toggleCode } from './actions';

export const dynamic = 'force-dynamic';

interface CodeRow {
  id: string;
  code: string;
  kind: string;
  benefit_amount: number;
  starts_at: string | null;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
  status: string;
  created_at: string;
}

/** Codes and campaigns — one table for every kind of code (§88, §89). */
export default async function Codes() {
  await requireAdmin(PRIVILEGED_ROLES);
  const supabase = await getSessionClient();

  const { data } = await supabase
    .from('promotion_codes')
    .select('id, code, kind, benefit_amount, starts_at, expires_at, max_uses, use_count, status, created_at')
    .in('kind', ['campaign', 'partnership', 'promotion', 'influencer'])
    .order('created_at', { ascending: false })
    .limit(200);

  const codes = (data as CodeRow[] | null) ?? [];

  return (
    <>
      <h1 className="page-title">Códigos e Campanhas</h1>
      <p className="page-subtitle">
        Códigos pessoais de indicação não aparecem aqui — cada usuário recebe o seu
        automaticamente no cadastro.
      </p>

      <form action={createCode} className="card" style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <div>
            <label htmlFor="code" className="stat-label">CÓDIGO</label>
            <input id="code" name="code" className="input" placeholder="VERAO26" required />
          </div>
          <div>
            <label htmlFor="kind" className="stat-label">TIPO</label>
            <select id="kind" name="kind" className="select" defaultValue="campaign">
              <option value="campaign">Campanha</option>
              <option value="partnership">Parceria</option>
              <option value="promotion">Promoção</option>
            </select>
          </div>
          <div>
            <label htmlFor="benefit" className="stat-label">DESCONTO (R$)</label>
            <input id="benefit" name="benefit" className="input" defaultValue="10,00" />
          </div>
          <div>
            <label htmlFor="maxUses" className="stat-label">LIMITE DE USOS</label>
            <input id="maxUses" name="maxUses" className="input" type="number" min="1" placeholder="ilimitado" />
          </div>
          <div>
            <label htmlFor="expiresAt" className="stat-label">VALIDADE</label>
            <input id="expiresAt" name="expiresAt" className="input" type="date" />
          </div>
        </div>
        <button type="submit" className="button" style={{ justifySelf: 'start' }}>
          Criar código
        </button>
      </form>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {codes.length === 0 ? (
          <div className="empty">Nenhum código criado ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Tipo</th>
                <th>Benefício</th>
                <th>Usos</th>
                <th>Validade</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{code.code}</td>
                  <td className="small">{code.kind}</td>
                  <td className="small mono">{formatCents(code.benefit_amount)}</td>
                  <td className="small mono">
                    {code.use_count}
                    {code.max_uses ? ` / ${code.max_uses}` : ''}
                  </td>
                  <td className="small mono">
                    {code.expires_at
                      ? new Date(code.expires_at).toLocaleDateString('pt-BR')
                      : <span className="muted">sem validade</span>}
                  </td>
                  <td>
                    <span className={`badge ${code.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                      {code.status}
                    </span>
                  </td>
                  <td>
                    <form action={toggleCode}>
                      <input type="hidden" name="codeId" value={code.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={code.status === 'active' ? 'inactive' : 'active'}
                      />
                      <button type="submit" className="button button-ghost">
                        {code.status === 'active' ? 'Desativar' : 'Ativar'}
                      </button>
                    </form>
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
