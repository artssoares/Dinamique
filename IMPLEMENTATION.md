# Implementation status

Honest status per area. "Built" means working against a real database, not a
mockup. Nothing listed as not built is stubbed with a button that does nothing.

## Foundations – done

| Item | State |
| --- | --- |
| Monorepo, strict TypeScript | done |
| Domain types and enums | done |
| Money / units / dates | done, 15 tests |
| Business logic | done, 102 tests |
| Design tokens, light + dark | done, 14 tests including contrast |
| Component library (11 components) | done |
| Database schema, RLS, grants, functions, views | done, 29 assertions |
| Reference data | done |

## Phase 2 – profile, vehicle, onboarding

| Item | State |
| --- | --- |
| Onboarding (work modes, platforms, first goals) | **built** |
| Navigation shell, 5 tabs | **built** |
| Theme switching, persisted | **built** |
| Profile editing, avatar upload | **built** – image compressed before upload |
| Vehicle registration and catalogue picker | **built** – 16 makes, 54 models, 58 versions |
| Product tour | **built** – conteúdo vem do banco, editável pelo Admin |

## Phase 3–4 – the daily loop

| Item | State |
| --- | --- |
| Journey start / pause / resume / finish | **built** |
| Revenue entry with platform and trip count | **built** |
| Expense entry with category | **built** |
| Home: goal, profit, R$/h, R$/km, time-to-goal | **built** |
| Fuel entry screen | **built** – informe dois valores, o terceiro é calculado |
| Guided journey close (revenue per platform, km, quick expense chips) | **built** – três passos e um resumo |
| Goal management screen | **built** – create, edit and remove per period |

## Phase 5 – history and insights

| Item | State |
| --- | --- |
| History with period totals | **built** |
| Rule-based insights | **built** |
| Automatic period summaries (§54) | **built** – frases, não gráficos |
| Projections in the UI | **built** – só a partir de 3 dias de dados |
| Daily score in the UI | **built** – com a fórmula explicada na tela |
| Benchmark | **built** – agregação por cidade e nacional, mínimo de 20 usuários |

## Phase 6 – recurring costs and obligations

| Item | State |
| --- | --- |
| Custos fixos com rateio por dia | **built** |
| Manutenção com lembrete por km ou data | **built** |
| Multas com prazo de desconto | **built** |
| Free Flow manual com lembrete | **built** |
| Notificações automáticas dos lembretes | **built** – `process_reminders()`, idempotente, agendável por pg_cron |

## Phase 7 – notifications and support

| Item | State |
| --- | --- |
| Notification centre, deep links, mark all read | **built** |
| Bell and support badges, Realtime | **built** |
| Support inbox, new ticket, conversation | **built** |
| Admin inbox, reply, internal notes, assign, status | **built** |
| Push notifications | **parcial** – registro de token e Edge Function escritos; a chamada à API da Expo não foi verificada (exige credenciais) |
| Attachments | **not built** – column exists |
| Admin notification composer (§99, §100) | **built** – segmentação por cidade, estado, modalidade, plano e atividade |

## Phase 8 – exports

| Item | State |
| --- | --- |
| XLSX com 7 abas, moeda, datas, larguras e totais | **built** |
| CSV com separador `;` e vírgula decimal | **built** |
| Períodos predefinidos e personalizado | **built** |
| Compartilhamento nativo no celular, download na web | **built** |
| Registro de cada exportação em `exports` | **built** |
| Exportação no Admin | **not built** – Fase 12, reaproveita `@dinamique/exports` |

15 testes, incluindo abrir o XLSX gerado de volta e conferir valores e formatos.

## Phase 9 – plans

| Item | State |
| --- | --- |
| 7-day trial on signup | **built** |
| Plan resolution and feature gating | **built** and tested |
| Upgrade / payment flow | **built** – Stripe com plano anual (R$ 49,90) e mensal (R$ 19,90) |
| Admin plan grants | **built** – conceder, prazo, cancelar, com Audit Log |

## Phase 10 – growth

| Item | State |
| --- | --- |
| Referral code, share, "minhas indicações" | **built** |
| Code redemption with antifraud | **built** and tested |
| Influencer application and status | **built** |
| Admin influencer review and code issuing | **built** |
| Admin codes and campaigns | **built** |
| Influencer dashboard, click tracking | **not built** |

## Phase 11–12 – admin

| Item | State |
| --- | --- |
| Dashboard, support, users, influencers, referrals, codes, audit log | **built** |
| User detail page, block, promote to admin | **built** – ninguém altera o próprio acesso |
| Analytics de aquisição, plataformas, veículos e suporte | **built** |
| Report builder com dimensões e filtros cruzados | **built** |
| Exportação do Admin em XLSX e CSV | **built** – com Audit Log |
| CRUD de plataformas, categorias, manutenção, suporte, tour | **built** |
| Importação de veículos por CSV | **built** – com erro legível por linha |
| Editor de regras de insight | **built** |
| Relatórios salvos | **not built** – tabela existe, tela não |
| Gráficos | **not built** – os relatórios são tabelas |

## Phase 13 – offline

| Item | State |
| --- | --- |
| Fila de sincronização persistida no aparelho | **built** – 10 testes |
| Reenvio idempotente por `client_id` | **built** – índice único garante uma linha só |
| Sincronização ao reconectar e ao voltar para o app | **built** |
| Barra avisando que o registro foi guardado | **built** |
| Jornadas offline | **not built** – receitas, despesas e abastecimentos entram na fila |

## Phase 14 – testes, segurança e revisão

| Item | State |
| --- | --- |
| Testes das regras de negócio | **built** – 109 |
| Testes de exportação | **built** – 15, com reabertura do XLSX |
| Testes da fila offline | **built** – 10 |
| Testes do report builder | **built** – 6 |
| Asserções de banco (RLS, antifraude, notificações, permissões) | **built** – 41 |
| Testes de contraste dos tokens | **built** – 14 |
| Varredura de segurança no CI | **built** |
| Documentação | **built** – 12 arquivos |

## Verified end to end

- both apps build: the admin prerenders, the mobile app exports 1,059 modules
- 131 unit tests, 29 database assertions, 6/6 packages typecheck
- CI runs all of the above plus both builds on every push
- demo seed produces realistic figures (R$ 1,71–3,06/km, R$ 19–41 profit/hour)
  and demonstrates the benchmark minimum correctly withholding city-level data

## Known gaps outside the phase plan

- **The logo is not in the repository.** `<BrandMark>` renders a visible
  placeholder. See `assets/brand/README.md`.
- **Tab icons** are placeholder glyphs, not a finished icon set.
