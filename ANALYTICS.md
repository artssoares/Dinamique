# Analytics e relatórios

## Duas camadas separadas de propósito

**Operacional** – as tabelas que o aplicativo escreve o dia inteiro.
**Analítica** – views que o Admin consulta.

Uma consulta de relatório nunca bate direto nas tabelas quentes. Quando o
volume exigir, as views viram *materialized views* atualizadas por
agendamento, e nenhuma consulta de quem chama precisa mudar.

Todas as views excluem contas de demonstração (`profiles.is_demo`).

| View | Grão |
| --- | --- |
| `analytics_users` | um usuário, com plano, aquisição, veículo e demografia |
| `analytics_user_financials` | um usuário, com faturamento, lucro, horas, km e as taxas |
| `analytics_acquisition` | uma origem, com cadastros, Pro, conversão e retenção |
| `analytics_influencers` | um influenciador |
| `analytics_platforms` | uma plataforma |
| `analytics_vehicles` | um modelo de veículo |
| `analytics_support` | linha única com os números de suporte |
| `analytics_support_categories` | uma categoria de suporte |
| `benchmark_buckets` / `benchmark_national` | agregados anônimos, mínimo de 20 usuários |

## Qualidade, não só volume

`analytics_acquisition` traz conversão e retenção junto com a contagem. Sem
isso, um influenciador com 1.000 cadastros que não assinam parece melhor que um
com 100 que assinam – e é o contrário.

## Report Builder

`/relatorios` cruza dimensões e filtros:

**Dimensões:** cidade, estado, gênero, faixa etária, plano, origem de
aquisição, tipo de veículo, veículo, combustível, situação do veículo.

**Filtros:** cidade, estado, plano, modalidade, tipo de veículo, origem, faixa
etária, período de cadastro.

**Métricas** (sempre as mesmas, para dois relatórios nunca darem números
diferentes com o mesmo nome): usuários, faturamento, lucro, despesas, horas,
R$/hora, R$/km, custo/km, assinantes Pro, conversão, retenção 30 dias.

Os filtros vêm pela URL, então um recorte útil é um link que se salva ou se
compartilha.

### Por que a agregação é em memória

O cruzamento acontece em TypeScript, não em SQL montado em tempo de execução.
O volume aqui é de milhares de usuários e montar SQL a partir de entrada do
usuário é a porta de entrada clássica de injeção. Se o volume um dia exigir, a
troca é por uma função no banco com dimensões validadas – nunca por
concatenação de string.

A mesma regra do aplicativo vale aqui: métrica sem denominador é `null`, não
zero. Um grupo sem quilometragem registrada mostra traço em R$/km.

## Exportação

`/api/export/report` gera XLSX ou CSV com exatamente os filtros da tela,
reaproveitando `@dinamique/exports`. Cada exportação grava uma linha em
`exports` e uma entrada no Audit Log – exportar dados agregados de usuários é
ação sensível (§95).

## Eventos de produto

`analytics_events` é append-only pelo cliente e legível só por administradores
com papel de analista. A lista de eventos é fechada em
`packages/types/src/analytics.ts`: um evento que não esteja lá não pode ser
emitido, e é isso que mantém a base consultável.

### Eventos de trajeto

| Evento | Para que serve |
| --- | --- |
| `route_capture_enabled` | quantos motoristas ligam a contagem por GPS |
| `route_capture_denied` | **o que paga a conta** — diz se o texto da folha de permissão está funcionando, e em que etapa a pessoa desistiu |
| `route_replay_viewed` | se o replay é visto mais de uma vez ou só no dia em que aparece |
| `route_story_shared` | compartilhamentos, com `trimmed` e `earnings` — nunca o trajeto |

Nenhum deles carrega coordenada, endereço ou nome de lugar. `analytics_events`
é a base menos protegida do schema (administradores com papel de analista leem
tudo), e por isso é a última onde a localização de alguém pode aparecer.

## O que ainda não existe

- relatórios salvos (a tabela `saved_reports` existe; a tela não)
- gráficos – os relatórios são tabelas
- integração com data warehouse externo
