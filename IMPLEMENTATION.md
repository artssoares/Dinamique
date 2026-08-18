# Implementation status

Honest status per area. "Built" means working against a real database, not a
mockup. Nothing listed as not built is stubbed with a button that does nothing.

## Foundations — done

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

## Phase 2 — profile, vehicle, onboarding

| Item | State |
| --- | --- |
| Onboarding (work modes, platforms, first goals) | **built** |
| Navigation shell, 5 tabs | **built** |
| Theme switching, persisted | **built** |
| Profile editing, avatar upload | **built** — image compressed before upload |
| Vehicle registration and catalogue picker | **built** — 16 makes, 54 models, 58 versions |
| Product tour | **not built** — `tour_steps` seeded and admin-editable |

## Phase 3–4 — the daily loop

| Item | State |
| --- | --- |
| Journey start / pause / resume / finish | **built** |
| Revenue entry with platform and trip count | **built** |
| Expense entry with category | **built** |
| Home: goal, profit, R$/h, R$/km, time-to-goal | **built** |
| Fuel entry screen | **built** — informe dois valores, o terceiro é calculado |
| Guided journey close (revenue per platform, km, quick expense chips) | **built** — três passos e um resumo |
| Goal management screen | **built** — create, edit and remove per period |

## Phase 5 — history and insights

| Item | State |
| --- | --- |
| History with period totals | **built** |
| Rule-based insights | **built** |
| Automatic period summaries (§54) | **built** — frases, não gráficos |
| Projections in the UI | **built** — só a partir de 3 dias de dados |
| Daily score in the UI | **built** — com a fórmula explicada na tela |
| Benchmark | **built** — agregação por cidade e nacional, mínimo de 20 usuários |

## Phase 6 — recurring costs and obligations

Maintenance, recurring costs, fines and Free Flow all have tables, constraints
and tested apportionment logic. **No screens.**

## Phase 7 — notifications and support

| Item | State |
| --- | --- |
| Notification centre, deep links, mark all read | **built** |
| Bell and support badges, Realtime | **built** |
| Support inbox, new ticket, conversation | **built** |
| Admin inbox, reply, internal notes, assign, status | **built** |
| Push notifications | **not built** |
| Attachments | **not built** — column exists |
| Admin notification composer (§99, §100) | **not built** |

## Phase 8 — exports

**Not built.** The `exports` table records them for audit; no generator exists.

## Phase 9 — plans

| Item | State |
| --- | --- |
| 7-day trial on signup | **built** |
| Plan resolution and feature gating | **built** and tested |
| Upgrade / payment flow | **not built** — no payment provider is integrated, and none is faked |
| Admin plan grants | **not built** — `subscriptions` supports it; no UI |

## Phase 10 — growth

| Item | State |
| --- | --- |
| Referral code, share, "minhas indicações" | **built** |
| Code redemption with antifraud | **built** and tested |
| Influencer application and status | **built** |
| Admin influencer review and code issuing | **built** |
| Admin codes and campaigns | **built** |
| Influencer dashboard, click tracking | **not built** |

## Phase 11–12 — admin

| Item | State |
| --- | --- |
| Dashboard, support, users, influencers, referrals, codes, audit log | **built** |
| User detail page, block, promote to admin | **not built** |
| Analytics & reports, report builder, cross-filtering | **not built** |
| Admin exports | **not built** |
| Vehicle / platform / category CRUD | **not built** |
| Insight and tour editors | **not built** — both are admin-editable tables already |

## Phase 13 — offline

**Not built.** `client_id` columns exist on journeys, revenues, expenses and
fuel logs so idempotent sync can be added without a migration.

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
