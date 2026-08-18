# @dinamique/admin

Next.js 15 admin panel (App Router, Server Components).

## Running

```bash
cp .env.example .env.local
pnpm --filter @dinamique/admin dev
```

## Two Supabase clients, two levels of power

| Helper | Subject to RLS | Use for |
| --- | --- | --- |
| `getSessionClient()` | yes — acts as the signed-in admin | everything the panel reads |
| `getServiceClient()` | **no — bypasses RLS entirely** | the few writes that legitimately cross users |

Every Server Action calls `requireAdmin(roles)` *before* touching the service
client, because a Server Action is a public endpoint and hiding a button in the
sidebar is not authorisation. Privileged writes then call `logAdminAction()`.

`SUPABASE_SERVICE_ROLE_KEY` has no `NEXT_PUBLIC_` prefix, so it can never reach
the browser bundle.

## Pages

| Route | State |
| --- | --- |
| `/` | built — user, activity, plan, ticket and referral counts |
| `/suporte` | built — inbox with status filters and sorting |
| `/suporte/[id]` | built — conversation, reply, internal notes, assign, status/priority/category |
| `/usuarios` | built — search, activity filters, last-access sorting |
| `/influencers` | built — applications with approve / reject / suspend and code issuing |
| `/indicacoes` | built — referral list with discount totals |
| `/codigos` | built — create, activate and deactivate campaign codes |
| `/logs` | built — audit log |

## Not built yet

Analytics & Reports (§87–97), the report builder, XLSX/CSV export, notification
composer, vehicle/platform/category CRUD, and plan grants from the user detail
page. These are named in `IMPLEMENTATION.md`; none of them is stubbed with a
non-functional button.

## Deploying to Vercel

| Setting | Value |
| --- | --- |
| Root Directory | `apps/admin` |
| Framework | Next.js |
| Build Command | `cd ../.. && pnpm --filter @dinamique/admin build` |
| Install Command | `pnpm install` |
| Output | `.next` (default) |

Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (mark the last one as sensitive; do not expose it to
preview deployments you do not control).
