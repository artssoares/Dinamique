import { requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import {
  createCatalogueItem,
  importVehicles,
  toggleCatalogueItem,
  updateInsightRule,
} from './actions';

export const dynamic = 'force-dynamic';

const CONTENT_ROLES = ['superadmin', 'admin', 'content'] as const;

interface Item {
  id: string;
  name?: string;
  title?: string;
  is_active: boolean;
  is_vehicle_cost?: boolean;
}

/** Catálogos administráveis (§101–105). */
export default async function Catalogues() {
  await requireAdmin([...CONTENT_ROLES]);
  const supabase = await getSessionClient();

  const [platforms, expenses, maintenance, support, tour, insights, vehicleCount] =
    await Promise.all([
      supabase.from('platforms').select('id, name, is_active').order('sort_order'),
      supabase.from('expense_categories').select('id, name, is_active, is_vehicle_cost').order('sort_order'),
      supabase.from('maintenance_types').select('id, name, is_active').order('sort_order'),
      supabase.from('support_categories').select('id, name, is_active').order('sort_order'),
      supabase.from('tour_steps').select('id, title, is_active').order('sort_order'),
      supabase.from('insight_rules').select('key, is_enabled, thresholds').order('key'),
      supabase.from('vehicle_versions').select('id', { count: 'exact', head: true }),
    ]);

  const rows = <T,>(result: { data: unknown }) => ((result.data as T[] | null) ?? []);

  return (
    <>
      <h1 className="page-title">Catálogos</h1>
      <p className="page-subtitle">
        Plataformas, categorias, passos do tour e regras de insight. Itens desativados somem do
        aplicativo, mas os lançamentos antigos continuam intactos.
      </p>

      <CatalogueBlock
        table="platforms"
        title="Plataformas"
        items={rows<Item>(platforms)}
      />
      <CatalogueBlock
        table="expense_categories"
        title="Categorias de despesa"
        hint="Só categorias marcadas como custo do veículo entram no cálculo de custo por km."
        items={rows<Item>(expenses)}
        showVehicleCost
      />
      <CatalogueBlock
        table="maintenance_types"
        title="Tipos de manutenção"
        items={rows<Item>(maintenance)}
      />
      <CatalogueBlock
        table="support_categories"
        title="Categorias do suporte"
        items={rows<Item>(support)}
      />
      <CatalogueBlock
        table="tour_steps"
        title="Passos do tour"
        items={rows<Item>(tour)}
        withDescription
      />

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Regras de insight</h2>
        <p className="small muted" style={{ margin: '0 0 12px' }}>
          O limiar define a partir de que variação a frase aparece para o motorista.
        </p>
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead>
              <tr><th>Regra</th><th>Ativa</th><th>Limiar</th><th></th></tr>
            </thead>
            <tbody>
              {rows<{ key: string; is_enabled: boolean; thresholds: Record<string, number> }>(insights).map(
                (rule) => (
                  <tr key={rule.key}>
                    <td className="small mono">{rule.key}</td>
                    <td colSpan={3}>
                      <form action={updateInsightRule} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="hidden" name="key" value={rule.key} />
                        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input type="checkbox" name="enabled" defaultChecked={rule.is_enabled} />
                          ativa
                        </label>
                        <input
                          name="threshold"
                          className="input"
                          style={{ maxWidth: 120 }}
                          defaultValue={Object.values(rule.thresholds ?? {})[0] ?? ''}
                          placeholder="0.05"
                        />
                        <button type="submit" className="button button-ghost">Salvar</button>
                      </form>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>Importar veículos</h2>
        <p className="small muted" style={{ margin: '0 0 12px' }}>
          {vehicleCount.count ?? 0} versões no catálogo. Cole linhas no formato{' '}
          <code>marca;modelo;tipo;versão;ano;motor;combustível;consumo urbano;consumo rodoviário</code>.
          O consumo vai em km/l. A conversão para a unidade interna é feita aqui.
        </p>
        <form action={importVehicles} className="card" style={{ display: 'grid', gap: 12 }}>
          <textarea
            name="csv"
            className="textarea"
            style={{ minHeight: 140, fontFamily: 'monospace', fontSize: 13 }}
            placeholder={'Honda;Civic;car;2.0 EXL;2020;2.0;gasoline;10,3;13,9'}
          />
          <button type="submit" className="button" style={{ justifySelf: 'start' }}>
            Importar
          </button>
        </form>
      </section>
    </>
  );
}

function CatalogueBlock({
  table,
  title,
  hint,
  items,
  showVehicleCost,
  withDescription,
}: {
  table: string;
  title: string;
  hint?: string;
  items: Item[];
  showVehicleCost?: boolean;
  withDescription?: boolean;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>{title}</h2>
      {hint ? <p className="small muted" style={{ margin: '0 0 12px' }}>{hint}</p> : null}

      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              {showVehicleCost ? <th>Custo do veículo</th> : null}
              <th>Situação</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name ?? item.title}</td>
                {showVehicleCost ? (
                  <td className="small">{item.is_vehicle_cost ? 'sim' : 'não'}</td>
                ) : null}
                <td>
                  <span className={`badge ${item.is_active ? 'badge-success' : 'badge-neutral'}`}>
                    {item.is_active ? 'ativo' : 'inativo'}
                  </span>
                </td>
                <td>
                  <form action={toggleCatalogueItem}>
                    <input type="hidden" name="table" value={table} />
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="active" value={item.is_active ? 'false' : 'true'} />
                    <button type="submit" className="button button-ghost">
                      {item.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={createCatalogueItem} className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <input type="hidden" name="table" value={table} />
        <input name="name" className="input" style={{ maxWidth: 260 }} placeholder={`Novo item em ${title.toLowerCase()}`} required />
        {withDescription ? (
          <input name="description" className="input" style={{ maxWidth: 320 }} placeholder="Descrição" />
        ) : null}
        {showVehicleCost ? (
          <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', minHeight: 40 }}>
            <input type="checkbox" name="isVehicleCost" defaultChecked />
            é custo do veículo
          </label>
        ) : null}
        <button type="submit" className="button">Adicionar</button>
      </form>
    </section>
  );
}
