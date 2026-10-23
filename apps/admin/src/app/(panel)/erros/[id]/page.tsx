import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  buildErrorPrompt,
  describeErrorStatus,
  describeWhen,
  explainError,
} from '@dinamique/business-logic';
import { APP_ERROR_STATUSES, type AppError } from '@dinamique/types';
import { CopyButton } from '@/components/CopyButton';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import { setErrorStatus } from '../actions';

export const dynamic = 'force-dynamic';

interface Row {
  id: number;
  fingerprint: string;
  source: AppError['source'];
  severity: AppError['severity'];
  title: string;
  detail: string | null;
  screen: string | null;
  app_version: string | null;
  platform: AppError['platform'];
  occurrences: number;
  context: Record<string, unknown>;
  status: AppError['status'];
  note: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

interface Occurrence {
  id: number;
  user_id: string | null;
  app_version: string | null;
  platform: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Novo — ninguém olhou ainda',
  investigating: 'Investigando — estou cuidando disso',
  resolved: 'Resolvido — corrigido e publicado',
  ignored: 'Ignorado — sei o que é e não vou mexer',
};

/**
 * A ficha de um erro: o que é, quem sentiu, e o prompt pronto para descobrir
 * a causa. O prompt é a razão desta página existir — ver a falha sem poder
 * fazer nada com ela não ajuda quem não programa.
 */
export default async function ErrorDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id: idRaw } = await params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const supabase = await getSessionClient();

  const [error, events] = await Promise.all([
    supabase
      .from('app_errors')
      .select('*')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('app_error_events')
      .select('id, user_id, app_version, platform, created_at')
      .eq('error_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const row = error.data as Row | null;
  if (!row) notFound();

  const occurrences = (events.data as Occurrence[] | null) ?? [];
  const affectedUsers = new Set(
    occurrences.filter((o) => o.user_id !== null).map((o) => o.user_id),
  ).size;

  const shaped = {
    id: row.id,
    title: row.title,
    detail: row.detail,
    severity: row.severity,
    source: row.source,
    screen: row.screen,
    platform: row.platform,
    appVersion: row.app_version,
    occurrences: row.occurrences,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    context: row.context ?? {},
  };

  const explanation = explainError(shaped, affectedUsers);
  const prompt = buildErrorPrompt(shaped, { affectedUsers });

  const canTriage = PRIVILEGED_ROLES.includes(admin.role);

  return (
    <>
      <div className="filters">
        <Link href="/erros" className="chip">← Voltar para os erros</Link>
      </div>

      <h1 className="page-title" style={{ wordBreak: 'break-word' }}>{row.title}</h1>
      <p className="page-subtitle">
        {describeErrorStatus(row.status)} · visto pela última vez {describeWhen(row.last_seen_at)} ·
        primeira vez em {new Date(row.first_seen_at).toLocaleString('pt-BR')}
      </p>

      <div className="card" style={{ display: 'grid', gap: 10, maxWidth: 760 }}>
        <strong>Em palavras simples</strong>
        <p style={{ margin: 0 }}>{explanation.what}</p>
        <p className="small muted" style={{ margin: 0 }}>{explanation.impact}</p>
        <p className="small" style={{ margin: 0 }}>
          <strong>O que fazer: </strong>
          {explanation.nextStep}
        </p>
      </div>

      <div className="stat-grid" style={{ marginTop: 16 }}>
        {[
          { label: 'Vezes que aconteceu', value: row.occurrences },
          { label: 'Pessoas atingidas', value: affectedUsers },
          { label: 'Tela', value: row.screen ?? '–' },
          { label: 'Versão do app', value: row.app_version ?? '–' },
          { label: 'Aparelho', value: row.platform ?? '–' },
          {
            label: 'Origem',
            value: row.source === 'mobile' ? 'aplicativo' : row.source === 'admin' ? 'painel' : 'servidor',
          },
        ].map((stat) => (
          <div key={stat.label} className="card">
            <div className="stat-label">{stat.label.toUpperCase()}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      <h2 className="page-title" style={{ fontSize: 20, marginTop: 24 }}>
        Prompt para avaliar este erro
      </h2>
      <p className="small muted" style={{ marginTop: 0, maxWidth: 700 }}>
        Copie e cole numa conversa com o Claude. Já vai com a tela, o aparelho, a versão, quantas
        vezes aconteceu e o detalhe técnico — tudo o que iriam te perguntar de volta.
      </p>

      <div className="card" style={{ display: 'grid', gap: 12, maxWidth: 900 }}>
        <CopyButton text={prompt} />
        <pre
          className="small mono"
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: 360,
            overflowY: 'auto',
            background: 'var(--surface-sunken, transparent)',
          }}
        >
          {prompt}
        </pre>
      </div>

      {row.detail ? (
        <>
          <h2 className="page-title" style={{ fontSize: 20, marginTop: 24 }}>Detalhe técnico</h2>
          <div className="card">
            <pre
              className="small mono"
              style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflowY: 'auto' }}
            >
              {row.detail}
            </pre>
          </div>
        </>
      ) : null}

      {canTriage ? (
        <>
          <h2 className="page-title" style={{ fontSize: 20, marginTop: 24 }}>Situação</h2>
          <form action={setErrorStatus} className="card" style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
            <input type="hidden" name="id" value={row.id} />

            <label htmlFor="status" className="stat-label">COMO ESTÁ ESTE PROBLEMA</label>
            <select id="status" className="input" name="status" defaultValue={row.status}>
              {APP_ERROR_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>

            <label htmlFor="note" className="stat-label">ANOTAÇÃO (SÓ VOCÊ E OS ADMINS VEEM)</label>
            <textarea
              id="note"
              className="textarea"
              name="note"
              rows={3}
              defaultValue={row.note ?? ''}
              placeholder="Ex.: corrigido na versão 1.0.5, esperando a Play aprovar."
            />

            <button type="submit" className="button">Salvar</button>

            <p className="small muted" style={{ margin: 0 }}>
              Se você marcar como resolvido e o erro voltar a acontecer, ele reabre sozinho.
            </p>
          </form>
        </>
      ) : null}

      <h2 className="page-title" style={{ fontSize: 20, marginTop: 24 }}>Últimas ocorrências</h2>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {occurrences.length === 0 ? (
          <div className="empty">Sem ocorrências registradas.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Pessoa</th>
                <th>Aparelho</th>
                <th>Versão</th>
              </tr>
            </thead>
            <tbody>
              {occurrences.map((occurrence) => (
                <tr key={occurrence.id}>
                  <td className="small mono">{new Date(occurrence.created_at).toLocaleString('pt-BR')}</td>
                  <td className="small">
                    {occurrence.user_id ? (
                      <Link href={`/usuarios/${occurrence.user_id}`}>abrir a ficha</Link>
                    ) : (
                      <span className="muted">sem conta (tela de login)</span>
                    )}
                  </td>
                  <td className="small mono">{occurrence.platform ?? '–'}</td>
                  <td className="small mono">{occurrence.app_version ?? '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
