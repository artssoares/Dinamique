# dinamique.

Financial and performance app for people who earn money with a vehicle —
rideshare drivers, taxi drivers, couriers and delivery riders.

The product answers one question that platform apps do not: **not how much you
received, but how much you actually made.**

## Status

This repository is under active construction. What is built is genuinely built
and connected to a real database; what is not built says so on screen rather
than pretending. See [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) for the phase
plan and exactly where each area stands.

| Layer | State |
| --- | --- |
| Business logic (`packages/business-logic`) | 102 tests — profit, R$/h, R$/km, goals, projections, score, vehicle cost, benchmark, codes, referrals, plans, support |
| Database (`packages/database`) | 42 tables, 105 RLS policies, 29 behaviour assertions |
| Design system (`packages/ui`) | tokens + 11 components, contrast asserted in both themes |
| Mobile app (`apps/mobile`) | auth, onboarding, Home, journeys, entries, history, insights, support, referrals, influencer |
| Admin (`apps/admin`) | dashboard, support inbox, users, influencers, referrals, codes, audit log |

## Requirements

- Node 20+
- pnpm 10+
- [Supabase CLI](https://supabase.com/docs/guides/cli) for the database
- Expo Go, or an iOS/Android simulator, for the app

## Setup

```bash
pnpm install

# database
supabase start
pnpm --filter @dinamique/database test    # applies migrations and asserts behaviour

# app
cp apps/mobile/.env.example apps/mobile/.env
pnpm mobile

# admin
cp apps/admin/.env.example apps/admin/.env.local
pnpm admin
```

## Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | mobile | public |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile | public by design; useless without a session because of RLS |
| `NEXT_PUBLIC_SUPABASE_URL` | admin | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | admin | public |
| `SUPABASE_SERVICE_ROLE_KEY` | admin, server only | **bypasses RLS.** Never `NEXT_PUBLIC_`, never in the app, never committed |

Real values never enter the repository. `.env*` is gitignored except the
`.env.example` files.

## Layout

```
apps/mobile              Expo Router — iOS, Android, Web
apps/admin               Next.js 15 — admin panel
packages/types           domain model, enums mirroring the database
packages/utils           integer-cent money, units, calendar-day helpers
packages/business-logic  every financial rule, pure and tested
packages/ui              design tokens, theme, React Native components
packages/database        migrations, RLS, functions, views, tests
assets/brand             logo and brand colours
```

## Monorepo layout note

`.npmrc` hoists everything into the root `node_modules` **except React**.

Metro resolves from the filesystem rather than Node's algorithm, and parts of
the Expo toolchain require transitive dependencies they never declare, so a
strict pnpm layout cannot bundle the app. React is excluded because the mobile
app is on React 18 (React Native 0.76) and the admin on React 19 — hoisting
either makes Next's `styled-jsx` bind a second React copy and every prerender
fails. Both builds are verified after any dependency change.

## Commands

```bash
pnpm typecheck   # all packages
pnpm test        # unit tests + database assertions (skips if no Postgres)
pnpm build       # builds the admin
pnpm mobile      # Expo dev server
pnpm admin       # Next.js dev server
```

## Documentation

| File | Contents |
| --- | --- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | why the pieces are split this way |
| [`DATABASE.md`](./DATABASE.md) | schema, invariants, security model |
| [`PRODUCT_RULES.md`](./PRODUCT_RULES.md) | every calculation, stated so it can be checked |
| [`DESIGN_SYSTEM.md`](./DESIGN_SYSTEM.md) | palette, tokens, components, motion |
| [`IMPLEMENTATION.md`](./IMPLEMENTATION.md) | phase plan and current status |
| [`SUPPORT.md`](./SUPPORT.md) | ticket lifecycle, notifications, internal notes |
| [`REFERRALS.md`](./REFERRALS.md) | codes, referrals, influencers, discounts, antifraud |
| [`ANALYTICS.md`](./ANALYTICS.md) | camada analítica, report builder, eventos |
| [`NOTIFICATIONS.md`](./NOTIFICATIONS.md) | canais, segmentação, lembretes |
| [`ADMIN.md`](./ADMIN.md) | papéis, áreas, deploy na Vercel |
| [`EXPORTS.md`](./EXPORTS.md) | formatos, regras herdadas do app |

## Two rules the codebase enforces structurally

1. **Money is integer cents.** Never a float, anywhere, at any layer.
2. **A metric with no denominator is `null`.** No distance means no R$/km — the
   UI shows a dash and says why. An invented number is worse than no number.
