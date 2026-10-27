import Link from 'next/link';
import { describeWhen } from '@dinamique/business-logic';
import type { QaResultStatus } from '@dinamique/types';
import { SUPPORT_ROLES, requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import {
  createCase,
  createSuite,
  deleteRun,
  finishRun,
  recordResult,
  startRun,
  updateCase,
  updateSuite,
} from './actions';

export const dynamic = 'force-dynamic';

interface SuiteRow {
  id: string;
  name: string;
  description: string | null;
  position: number;
  is_active: boolean;
}

interface CaseRow {
  id: string;
  suite_id: string;
  title: string;
  steps: string | null;
  expected: string | null;
  is_critical: boolean;
  position: number;
  is_active: boolean;
}

interface RunRow {
  id: string;
  label: string;
  app_version: string | null;
  platform: string | null;
  started_at: string;
  finished_at: string | null;
}

interface ResultRow {
  case_id: string;
  status: QaResultStatus;
  note: string | null;
  tested_at: string;
}

const MARKS: { value: QaResultStatus | ''; label: string; badge: string }[] = [
  { value: 'pass', label: 'Passou', badge: 'badge-success' },
  { value: 'fail', label: 'Falhou', badge: 'badge-danger' },
  { value: 'blocked', label: 'Travado', badge: 'badge-warning' },
  { value: 'skipped', label: 'Pulei', badge: 'badge-neutral' },
  { value: '', label: 'Limpar', badge: 'badge-neutral' },
];

const STATUS_WORD: Record<QaResultStatus, string> = {
  pass: 'Passou',
  fail: 'Falhou',
  blocked: 'Travado',
  skipped: 'Pulei',
};

const STATUS_BADGE: Record<QaResultStatus, string> = {
  pass: 'badge-success',
  fail: 'badge-danger',
  blocked: 'badge-warning',
  skipped: 'badge-neutral',
};

/**
 * Área de testes: um roteiro do aplicativo inteiro, marcado a cada versão.
 *
 * Duas abas no mesmo lugar, porque são dois momentos diferentes: "testar
 * agora" (uma rodada aberta, com os botões de marcar) e "organizar o roteiro"
 * (criar área, criar caso, reordenar, desativar).
 */
export default async function Tests({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; tab?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const tab = params.tab === 'roteiro' ? 'roteiro' : 'rodada';

  const supabase = await getSessionClient();

  const [suitesRes, casesRes, runsRes] = await Promise.all([
    supabase.from('qa_suites').select('id, name, description, position, is_active').order('position'),
    supabase
      .from('qa_cases')
      .select('id, suite_id, title, steps, expected, is_critical, position, is_active')
      .order('position'),
    supabase
      .from('qa_runs')
      .select('id, label, app_version, platform, started_at, finished_at')
      .order('started_at', { ascending: false })
      .limit(30),
  ]);

  const suites = (suitesRes.data as SuiteRow[] | null) ?? [];
  const cases = (casesRes.data as CaseRow[] | null) ?? [];
  const runs = (runsRes.data as RunRow[] | null) ?? [];

  // Sem rodada escolhida, abrimos a última que ainda está aberta; sem nenhuma
  // aberta, a última de todas. Quem chega na tela quer continuar de onde parou.
  const current =
    runs.find((run) => run.id === params.run) ??
    runs.find((run) => run.finished_at === null) ??
    runs[0] ??
    null;

  const resultsRes = current
    ? await supabase
        .from('qa_results')
        .select('case_id, status, note, tested_at')
        .eq('run_id', current.id)
    : { data: null };

  const results = new Map(
    ((resultsRes.data as ResultRow[] | null) ?? []).map((row) => [row.case_id, row]),
  );

  const activeSuites = suites.filter((suite) => suite.is_active);
  // Um teste só conta se ele E a área dele estiverem em uso. Sem a segunda
  // metade, desativar uma área inteira esconderia os testes dela da lista mas
  // os manteria no placar: um crítico invisível travaria o "dá para publicar?"
  // sem existir nenhum lugar na tela onde marcá-lo.
  const activeSuiteIds = new Set(activeSuites.map((suite) => suite.id));
  const activeCases = cases.filter((item) => item.is_active && activeSuiteIds.has(item.suite_id));
  const canEdit = SUPPORT_ROLES.includes(admin.role);

  const counts = {
    total: activeCases.length,
    pass: 0,
    fail: 0,
    blocked: 0,
    skipped: 0,
  };
  for (const item of activeCases) {
    const status = results.get(item.id)?.status;
    if (status) counts[status] += 1;
  }
  const tested = counts.pass + counts.fail + counts.blocked + counts.skipped;

  const failedCritical = activeCases.filter(
    (item) => item.is_critical && results.get(item.id)?.status === 'fail',
  );
  // Travado e pulado não são aprovação: o fluxo essencial continua sem
  // resposta, e contá-los como resolvidos faria o painel dizer "pode publicar"
  // sobre algo que ninguém conseguiu testar.
  const untestedCritical = activeCases.filter(
    (item) => item.is_critical && results.get(item.id)?.status !== 'pass',
  );

  return (
    <>
      <h1 className="page-title">Testes</h1>
      <p className="page-subtitle">
        {counts.total} testes no roteiro, em {activeSuites.length} áreas do aplicativo.
      </p>

      <div className="filters">
        <Link href="/testes?tab=rodada" className="chip" aria-pressed={tab === 'rodada'}>
          Testar agora
        </Link>
        <Link href="/testes?tab=roteiro" className="chip" aria-pressed={tab === 'roteiro'}>
          Organizar o roteiro
        </Link>
      </div>

      {tab === 'rodada' ? (
        <>
          {canEdit ? (
            <form action={startRun} className="card" style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
              <strong>Começar uma rodada de testes</strong>
              <div className="small muted">
                Uma rodada é uma passada pelo roteiro. Dê um nome que você reconheça depois, por
                exemplo &quot;Versão 2, Android&quot;.
              </div>
              <input className="input" name="label" placeholder="Nome da rodada" required />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="input" name="appVersion" placeholder="Versão do app (opcional)" />
                <input className="input" name="platform" placeholder="Aparelho (opcional)" />
              </div>
              <button type="submit" className="button">Começar</button>
            </form>
          ) : null}

          {current === null ? (
            <div className="card empty" style={{ marginTop: 16 }}>
              Nenhuma rodada ainda. Comece uma acima para marcar os testes.
            </div>
          ) : (
            <>
              <div className="filters" style={{ marginTop: 16 }}>
                {runs.map((run) => (
                  <Link
                    key={run.id}
                    href={`/testes?tab=rodada&run=${run.id}`}
                    className="chip"
                    aria-pressed={run.id === current.id}
                  >
                    {run.label}
                    {run.finished_at === null ? '' : ' ✓'}
                  </Link>
                ))}
              </div>

              <div className="stat-grid">
                {[
                  { label: 'Testados', value: `${tested} de ${counts.total}` },
                  { label: 'Passaram', value: counts.pass },
                  { label: 'Falharam', value: counts.fail },
                  { label: 'Travados', value: counts.blocked },
                  { label: 'Pulados', value: counts.skipped },
                  {
                    label: 'Dá para publicar?',
                    value:
                      failedCritical.length > 0
                        ? 'Não'
                        : untestedCritical.length > 0
                          ? 'Falta testar'
                          : 'Sim',
                  },
                ].map((stat) => (
                  <div key={stat.label} className="card">
                    <div className="stat-label">{stat.label.toUpperCase()}</div>
                    <div className="stat-value">{stat.value}</div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
                <strong>
                  {failedCritical.length > 0
                    ? 'Tem teste essencial falhando'
                    : untestedCritical.length > 0
                      ? 'Ainda falta testar o essencial'
                      : 'Todos os testes essenciais passaram'}
                </strong>
                <p className="small muted" style={{ margin: 0 }}>
                  {failedCritical.length > 0
                    ? `Não publique ainda: ${failedCritical.map((item) => item.title).join('; ')}.`
                    : untestedCritical.length > 0
                      ? `Faltam ${untestedCritical.length} testes essenciais sem um "passou": não testados, travados ou pulados.`
                      : 'Os testes marcados como essenciais estão todos verdes nesta rodada.'}
                </p>
                {canEdit ? (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <form action={finishRun}>
                      <input type="hidden" name="id" value={current.id} />
                      <input
                        type="hidden"
                        name="reopen"
                        value={current.finished_at === null ? 'false' : 'true'}
                      />
                      <button type="submit" className="button button-ghost">
                        {current.finished_at === null ? 'Encerrar a rodada' : 'Reabrir a rodada'}
                      </button>
                    </form>
                    <form action={deleteRun}>
                      <input type="hidden" name="id" value={current.id} />
                      <button type="submit" className="button button-ghost">Apagar a rodada</button>
                    </form>
                  </div>
                ) : null}
              </div>

              {activeSuites.map((suite) => {
                const suiteCases = activeCases.filter((item) => item.suite_id === suite.id);
                if (suiteCases.length === 0) return null;

                return (
                  <section key={suite.id} style={{ marginTop: 24 }}>
                    <h2 className="page-title" style={{ fontSize: 20, marginBottom: 4 }}>
                      {suite.name}
                    </h2>
                    {suite.description ? (
                      <p className="small muted" style={{ marginTop: 0 }}>{suite.description}</p>
                    ) : null}

                    <div className="card" style={{ padding: 0 }}>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {suiteCases.map((item, index) => {
                          const result = results.get(item.id);
                          return (
                            <li
                              key={item.id}
                              style={{
                                padding: '14px 16px',
                                borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                                display: 'grid',
                                gap: 8,
                              }}
                            >
                              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                <strong style={{ flex: 1, minWidth: 240 }}>{item.title}</strong>
                                {item.is_critical ? (
                                  <span className="badge badge-brand">essencial</span>
                                ) : null}
                                {result ? (
                                  <span className={`badge ${STATUS_BADGE[result.status]}`}>
                                    {STATUS_WORD[result.status]} · {describeWhen(result.tested_at)}
                                  </span>
                                ) : (
                                  <span className="badge badge-neutral">não testado</span>
                                )}
                              </div>

                              {item.steps ? (
                                <div className="small">
                                  <span className="muted">Como testar: </span>
                                  {item.steps}
                                </div>
                              ) : null}
                              {item.expected ? (
                                <div className="small">
                                  <span className="muted">O certo é: </span>
                                  {item.expected}
                                </div>
                              ) : null}

                              {canEdit && current.finished_at === null ? (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  {MARKS.map((mark) => (
                                    <form key={mark.label} action={recordResult}>
                                      <input type="hidden" name="runId" value={current.id} />
                                      <input type="hidden" name="caseId" value={item.id} />
                                      <input type="hidden" name="status" value={mark.value} />
                                      <button
                                        type="submit"
                                        className="button button-ghost"
                                        aria-pressed={result?.status === mark.value}
                                      >
                                        {mark.label}
                                      </button>
                                    </form>
                                  ))}
                                </div>
                              ) : null}

                              {result?.note ? (
                                <div className="small muted">Anotação: {result.note}</div>
                              ) : null}

                              {canEdit && current.finished_at === null ? (
                                <form
                                  action={recordResult}
                                  style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                                >
                                  <input type="hidden" name="runId" value={current.id} />
                                  <input type="hidden" name="caseId" value={item.id} />
                                  <input
                                    type="hidden"
                                    name="status"
                                    value={result?.status ?? 'fail'}
                                  />
                                  <input
                                    className="input"
                                    name="note"
                                    defaultValue={result?.note ?? ''}
                                    placeholder="O que aconteceu (opcional)"
                                    style={{ flex: 1, minWidth: 220 }}
                                  />
                                  <button type="submit" className="button button-ghost">
                                    Salvar anotação
                                  </button>
                                </form>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </section>
                );
              })}
            </>
          )}
        </>
      ) : (
        <>
          {canEdit ? (
            <form action={createSuite} className="card" style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
              <strong>Criar uma área nova</strong>
              <input className="input" name="name" placeholder="Nome da área (ex.: Pagamentos)" required />
              <input className="input" name="description" placeholder="Para que serve (opcional)" />
              <input className="input" name="position" type="number" placeholder="Ordem (10, 20, 30…)" />
              <button type="submit" className="button">Criar área</button>
            </form>
          ) : (
            <div className="card empty">Seu nível de acesso não edita o roteiro.</div>
          )}

          {suites.map((suite) => {
            const suiteCases = cases.filter((item) => item.suite_id === suite.id);

            return (
              <section key={suite.id} style={{ marginTop: 24 }}>
                <div className="card" style={{ display: 'grid', gap: 10 }}>
                  {canEdit ? (
                    <form action={updateSuite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input type="hidden" name="id" value={suite.id} />
                      <input className="input" name="name" defaultValue={suite.name} aria-label="Nome da área" style={{ flex: 1, minWidth: 200 }} />
                      <input className="input" name="description" defaultValue={suite.description ?? ''} aria-label="Descrição" style={{ flex: 1, minWidth: 200 }} />
                      <input className="input" name="position" type="number" defaultValue={suite.position} aria-label="Ordem" style={{ width: 96 }} />
                      <button type="submit" className="button button-ghost">Salvar</button>
                    </form>
                  ) : (
                    <strong>{suite.name}</strong>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className={`badge ${suite.is_active ? 'badge-success' : 'badge-neutral'}`}>
                      {suite.is_active ? 'em uso' : 'desativada'}
                    </span>
                    <span className="small muted">
                      {suiteCases.length} testes · ordem {suite.position}
                    </span>
                    {canEdit ? (
                      <>
                        <form action={updateSuite}>
                          <input type="hidden" name="id" value={suite.id} />
                          <input type="hidden" name="isActive" value={suite.is_active ? 'false' : 'true'} />
                          <button type="submit" className="button button-ghost">
                            {suite.is_active ? 'Desativar' : 'Reativar'}
                          </button>
                        </form>
                        <form action={updateSuite}>
                          <input type="hidden" name="id" value={suite.id} />
                          <input type="hidden" name="intent" value="delete" />
                          <button type="submit" className="button button-ghost">
                            Apagar a área e seus testes
                          </button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="card" style={{ padding: 0, marginTop: 8 }}>
                  {suiteCases.length === 0 ? (
                    <div className="empty">Nenhum teste nesta área ainda.</div>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {suiteCases.map((item, index) => (
                        <li
                          key={item.id}
                          style={{
                            padding: '12px 16px',
                            borderTop: index === 0 ? 'none' : '1px solid var(--border)',
                            display: 'grid',
                            gap: 8,
                          }}
                        >
                          {canEdit ? (
                            <form action={updateCase} style={{ display: 'grid', gap: 6 }}>
                              <input type="hidden" name="id" value={item.id} />
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <input className="input" name="title" defaultValue={item.title} aria-label="Título do teste" style={{ flex: 1, minWidth: 240 }} />
                                <input className="input" name="position" type="number" defaultValue={item.position} aria-label="Ordem" style={{ width: 96 }} />
                                <select className="input" name="suiteId" defaultValue={item.suite_id} aria-label="Área">
                                  {suites.map((option) => (
                                    <option key={option.id} value={option.id}>{option.name}</option>
                                  ))}
                                </select>
                              </div>
                              <input className="input" name="steps" defaultValue={item.steps ?? ''} placeholder="Como testar" aria-label="Como testar" />
                              <input className="input" name="expected" defaultValue={item.expected ?? ''} placeholder="O certo é" aria-label="Resultado esperado" />
                              <button type="submit" className="button button-ghost">Salvar o teste</button>
                            </form>
                          ) : (
                            <strong>{item.title}</strong>
                          )}

                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            {item.is_critical ? <span className="badge badge-brand">essencial</span> : null}
                            <span className={`badge ${item.is_active ? 'badge-success' : 'badge-neutral'}`}>
                              {item.is_active ? 'em uso' : 'desativado'}
                            </span>
                            {canEdit ? (
                              <>
                                <form action={updateCase}>
                                  <input type="hidden" name="id" value={item.id} />
                                  <input type="hidden" name="isCriticalValue" value={item.is_critical ? 'false' : 'true'} />
                                  <button type="submit" className="button button-ghost">
                                    {item.is_critical ? 'Não é essencial' : 'Marcar como essencial'}
                                  </button>
                                </form>
                                <form action={updateCase}>
                                  <input type="hidden" name="id" value={item.id} />
                                  <input type="hidden" name="isActive" value={item.is_active ? 'false' : 'true'} />
                                  <button type="submit" className="button button-ghost">
                                    {item.is_active ? 'Desativar' : 'Reativar'}
                                  </button>
                                </form>
                                <form action={updateCase}>
                                  <input type="hidden" name="id" value={item.id} />
                                  <input type="hidden" name="intent" value="delete" />
                                  <button type="submit" className="button button-ghost">Apagar</button>
                                </form>
                              </>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {canEdit ? (
                  <form action={createCase} className="card" style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                    <input type="hidden" name="suiteId" value={suite.id} />
                    <strong className="small">Adicionar um teste em {suite.name}</strong>
                    <input className="input" name="title" placeholder="O que testar" required />
                    <input className="input" name="steps" placeholder="Como testar" />
                    <input className="input" name="expected" placeholder="O certo é" />
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input className="input" name="position" type="number" placeholder="Ordem" style={{ width: 110 }} />
                      <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" name="isCritical" />
                        É essencial (sem ele não dá para publicar)
                      </label>
                      <button type="submit" className="button button-ghost">Adicionar</button>
                    </div>
                  </form>
                ) : null}
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
