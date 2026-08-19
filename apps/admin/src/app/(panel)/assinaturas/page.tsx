import { formatCents } from '@dinamique/utils';
import { annualSavings, monthlyEquivalent } from '@dinamique/billing';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import { changePrice, syncPrices } from './actions';

export const dynamic = 'force-dynamic';

/** Assinaturas e preços (§85). */
export default async function Subscriptions() {
  const admin = await requireAdmin([...PRIVILEGED_ROLES]);
  const supabase = await getSessionClient();

  const [pricesResult, subscriptionsResult, eventsResult] = await Promise.all([
    supabase
      .from('billing_prices')
      .select('id, interval, amount, stripe_price_id, is_active')
      .eq('is_active', true)
      .order('interval'),
    supabase
      .from('subscriptions')
      .select('billing_status, billing_interval, source, current_period_end')
      .not('stripe_subscription_id', 'is', null),
    supabase
      .from('billing_events')
      .select('stripe_event_id, type, event_created_at, error')
      .order('processed_at', { ascending: false })
      .limit(20),
  ]);

  const prices = (pricesResult.data as Record<string, any>[] | null) ?? [];
  const subscriptions = (subscriptionsResult.data as Record<string, any>[] | null) ?? [];
  const events = (eventsResult.data as Record<string, any>[] | null) ?? [];

  const monthly = prices.find((price) => price.interval === 'month');
  const annual = prices.find((price) => price.interval === 'year');
  const savings = monthly && annual ? annualSavings(Number(monthly.amount), Number(annual.amount)) : null;

  const active = subscriptions.filter((s) =>
    ['active', 'trialing', 'past_due'].includes(String(s.billing_status)),
  );
  const monthlyCount = active.filter((s) => s.billing_interval === 'month').length;
  const annualCount = active.filter((s) => s.billing_interval === 'year').length;

  // Receita recorrente mensalizada: o anual dividido por 12 para os dois
  // planos poderem ser somados sem distorcer o número.
  const mrr =
    monthlyCount * Number(monthly?.amount ?? 0) +
    annualCount * monthlyEquivalent(Number(annual?.amount ?? 0));

  const pending = prices.filter((price) => !price.stripe_price_id).length;
  const failures = events.filter((event) => event.error).length;

  return (
    <>
      <h1 className="page-title">Assinaturas</h1>
      <p className="page-subtitle">Preços, assinantes e os últimos eventos do Stripe.</p>

      {pending > 0 ? (
        <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--warning-text)' }}>
          <strong>
            {pending === 1 ? '1 preço ainda não foi publicado' : `${pending} preços ainda não foram publicados`}{' '}
            no Stripe.
          </strong>
          <p className="small muted" style={{ margin: '6px 0 12px' }}>
            Enquanto isso, o botão de assinar no aplicativo mostra que o pagamento está em
            configuração, em vez de abrir um checkout que falharia.
          </p>
          <form action={syncPrices}>
            <button type="submit" className="button" disabled={admin.role !== 'superadmin'}>
              Publicar preços no Stripe
            </button>
          </form>
          {admin.role !== 'superadmin' ? (
            <p className="small muted" style={{ marginTop: 8 }}>
              Só um superadmin pode publicar preços.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <Stat label="Assinantes ativos" value={active.length} />
        <Stat label="No plano mensal" value={monthlyCount} />
        <Stat label="No plano anual" value={annualCount} />
        <Stat label="Receita recorrente mensal" value={formatCents(mrr)} />
        <Stat label="Eventos com erro" value={failures} />
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Preços</h2>
        <p className="small muted" style={{ margin: '0 0 12px' }}>
          Preço no Stripe é imutável. Mudar o valor cria um preço novo e aposenta o anterior, e
          quem já assina continua no preço que contratou.
          {savings ? ` Hoje o anual economiza ${formatCents(savings.amount)} por ano.` : ''}
        </p>

        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Periodicidade</th>
                <th>Valor</th>
                <th>Equivalente mensal</th>
                <th>Id no Stripe</th>
                <th>Novo valor</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((price) => (
                <tr key={price.id}>
                  <td>{price.interval === 'year' ? 'Anual' : 'Mensal'}</td>
                  <td className="small mono">{formatCents(Number(price.amount))}</td>
                  <td className="small mono">
                    {price.interval === 'year'
                      ? formatCents(monthlyEquivalent(Number(price.amount)))
                      : '–'}
                  </td>
                  <td className="small mono">
                    {price.stripe_price_id ?? (
                      <span className="badge badge-warning">não publicado</span>
                    )}
                  </td>
                  <td>
                    <form action={changePrice} style={{ display: 'flex', gap: 6 }}>
                      <input type="hidden" name="interval" value={price.interval} />
                      <input
                        name="amount"
                        className="input"
                        style={{ maxWidth: 110 }}
                        placeholder="19,90"
                      />
                      <button
                        type="submit"
                        className="button button-ghost"
                        disabled={admin.role !== 'superadmin'}
                      >
                        Alterar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Últimos eventos do Stripe</h2>
        <p className="small muted" style={{ margin: '0 0 12px' }}>
          Cada evento é registrado uma vez. Reenvios do Stripe são reconhecidos e não repetem o
          efeito.
        </p>
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          {events.length === 0 ? (
            <div className="empty">Nenhum evento recebido ainda.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Quando</th><th>Tipo</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.stripe_event_id}>
                    <td className="small mono">
                      {new Date(event.event_created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="small mono">{event.type}</td>
                    <td className="small">
                      {event.error ? (
                        <span className="badge badge-danger">{event.error}</span>
                      ) : (
                        <span className="badge badge-success">processado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
    </div>
  );
}
