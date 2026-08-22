import { NOTIFICATION_CATEGORIES, WORK_MODES } from '@dinamique/types';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import { sendNotification } from './actions';

export const dynamic = 'force-dynamic';

/** Editor de notificações (§99, §100). */
export default async function Notifications() {
  await requireAdmin(PRIVILEGED_ROLES);
  const supabase = await getSessionClient();

  const { data: recent } = await supabase
    .from('admin_logs')
    .select('id, created_at, metadata, profiles(first_name)')
    .eq('action', 'notification.send')
    .order('created_at', { ascending: false })
    .limit(20);

  const sends = (recent as unknown as {
    id: string;
    created_at: string;
    metadata: { title?: string; category?: string; recipients?: number };
    profiles: { first_name: string } | null;
  }[] | null) ?? [];

  return (
    <>
      <h1 className="page-title">Notificações</h1>
      <p className="page-subtitle">
        Envio interno para o aplicativo. Quem desativou a categoria não recebe, e isso é
        verificado no banco, não aqui.
      </p>

      <form action={sendNotification} className="card" style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label htmlFor="title" className="stat-label">TÍTULO</label>
            <input id="title" name="title" className="input" required maxLength={80} />
          </div>
          <div>
            <label htmlFor="category" className="stat-label">CATEGORIA</label>
            <select id="category" name="category" className="select" defaultValue="news">
              {NOTIFICATION_CATEGORIES.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="body" className="stat-label">MENSAGEM</label>
          <textarea id="body" name="body" className="textarea" required maxLength={300} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label htmlFor="deepLink" className="stat-label">ABRIR AO TOCAR</label>
            <input id="deepLink" name="deepLink" className="input" placeholder="/support ou /referrals" />
          </div>
          <div>
            <label htmlFor="ctaLabel" className="stat-label">TEXTO DO BOTÃO</label>
            <input id="ctaLabel" name="ctaLabel" className="input" placeholder="Ver agora" />
          </div>
        </div>

        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 16 }}>
          <legend className="stat-label">PARA QUEM (vazio = todos)</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label htmlFor="cities" className="stat-label">CIDADES</label>
              <input id="cities" name="cities" className="input" placeholder="São Paulo, Curitiba" />
            </div>
            <div>
              <label htmlFor="states" className="stat-label">ESTADOS</label>
              <input id="states" name="states" className="input" placeholder="SP, RJ" />
            </div>
            <div>
              <label htmlFor="workModes" className="stat-label">MODALIDADES</label>
              <input
                id="workModes"
                name="workModes"
                className="input"
                placeholder={WORK_MODES.join(', ')}
              />
            </div>
            <div>
              <label htmlFor="plans" className="stat-label">PLANOS</label>
              <input id="plans" name="plans" className="input" placeholder="free, pro" />
            </div>
            <div>
              <label htmlFor="activeWithin" className="stat-label">ATIVOS HÁ ATÉ (DIAS)</label>
              <input id="activeWithin" name="activeWithin" className="input" type="number" min="1" />
            </div>
            <div>
              <label htmlFor="inactiveFor" className="stat-label">INATIVOS HÁ (DIAS)</label>
              <input id="inactiveFor" name="inactiveFor" className="input" type="number" min="1" />
            </div>
          </div>
        </fieldset>

        <button type="submit" className="button" style={{ justifySelf: 'start' }}>
          Enviar notificação
        </button>
      </form>

      <h2 style={{ fontSize: 16, margin: '0 0 12px' }}>Últimos envios</h2>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {sends.length === 0 ? (
          <div className="empty">Nenhum envio ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Título</th>
                <th>Categoria</th>
                <th>Destinatários</th>
                <th>Enviado por</th>
              </tr>
            </thead>
            <tbody>
              {sends.map((send) => (
                <tr key={send.id}>
                  <td className="small mono">{new Date(send.created_at).toLocaleString('pt-BR')}</td>
                  <td>{send.metadata?.title ?? '–'}</td>
                  <td className="small">{send.metadata?.category ?? '–'}</td>
                  <td className="small mono">{send.metadata?.recipients ?? 0}</td>
                  <td className="small">{send.profiles?.first_name ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
