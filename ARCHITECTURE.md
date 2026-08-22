# Architecture

## The shape

A pnpm monorepo with two apps and five packages. The split exists for one
reason: **a financial rule must have exactly one implementation.**

```
apps/mobile ─┐
             ├─→ packages/business-logic ─→ packages/utils ─→ packages/types
apps/admin  ─┘                          ↘
                                         packages/ui (mobile only)
                    both ─→ packages/database (schema, RLS, functions, views)
```

### `packages/types`

The domain model and the enums. Every enum here has a matching Postgres enum or
check constraint – they are kept in step by hand, and the database tests fail if
a value the code emits is rejected.

### `packages/utils`

Money, units and calendar arithmetic. Money is integer cents; distance is
integer metres; volume is millilitres; duration is seconds. Floats appear only
at the formatting boundary and in ratios, which are never money.

Dates are `YYYY-MM-DD` strings, not `Date` objects, because a driver's "day" is
a calendar day where they live rather than a UTC window. Weeks start on Monday.

### `packages/business-logic`

Pure functions, no I/O, no framework. This is where profit, R$/hour, R$/km,
cost/km, goals, projections, the daily score, benchmark gating, insights, code
validation, referral benefits, plan resolution and the support state machine
live.

A screen that does arithmetic is a bug. Both apps import from here, which is
what makes it impossible for the app and the panel to disagree about what a
number means.

### `packages/ui`

Design tokens plus React Native components. Also the route geometry — the
projection that turns a track into a drawable path — because the in-app replay
and the shared card draw the same shape, and two implementations of "where does
this line go" would eventually disagree about the same day. The tokens are plain TypeScript and
platform-agnostic; the components are React Native and mobile-only. The admin
deliberately does **not** depend on this package – it mirrors the same token
values as CSS custom properties, which keeps a React 19 app free of React
Native's React 18 types.

### `packages/database`

Migrations, RLS policies, grants, server-side functions and read-model views.
Tested by applying every migration to a real Postgres and asserting behaviour,
not by reading the DDL.

## Where each decision is enforced

The same rule is often stated in more than one place. The question that matters
is where it is *enforced* – where a mistake becomes impossible rather than
merely discouraged.

| Rule | Enforced by |
| --- | --- |
| one active journey per user | unique partial index |
| one primary vehicle per user | unique partial index |
| a referred account has one referrer | unique constraint |
| nobody refers themselves | check constraint + `redeem_code` + business logic |
| attribution is first-touch | `before update` trigger that raises |
| a support internal note never reaches the user | RLS policy on `support_messages` |
| a user cannot post as the support team | RLS `with check` on `author_kind` |
| a user cannot grant themselves Pro | no client `insert`/`update` grant on `subscriptions` |
| a discount is used at most once | benefit status + `redeem_benefit` |
| a metric with no denominator is null | `summarisePeriod`, asserted by tests |
| a route is never captured without consent | `capturePermitted`, read fresh at every start |
| a driver's own number beats a measured one | `journeyDistance` order, asserted by tests |
| colour contrast meets AA | token tests |

## Security model

Three levels of access, and the boundary between them is a deployment boundary,
not a code convention.

1. **anon** – nothing. Every screen requires a session.
2. **authenticated** – `select` on everything, narrowed to their own rows by
   RLS; `insert`/`update`/`delete` only on tables where a user legitimately
   creates their own data. Tables that grant value (`subscriptions`,
   `promotion_codes`, `referrals`, `discount_benefits`, `user_attribution`) are
   read-only to the client.
3. **service_role** – bypasses RLS. Exists only in the admin's server
   environment. Every Server Action that uses it calls `requireAdmin(roles)`
   first and `logAdminAction()` after.

Value is therefore always granted by the server: `redeem_code()` is a
`SECURITY DEFINER` function that runs every antifraud rule in one transaction,
and plan grants come from the panel.

## Data strategy

Operational tables are normalised and indexed for the queries the app makes.
Analytical reads go through views (`daily_totals`, `current_plans`,
`notification_counts`) so a reporting query never shapes an operational table.

`daily_totals` is the grain everything downstream is built from: one row per
user per calendar day. When volume justifies it, it becomes a materialised view
refreshed on a schedule – the query surface does not change.

`analytics_events` is append-only and readable only by admins with the analyst
role, which keeps the event stream available for a future warehouse without
exposing it to users.

## Route capture

GPS is opt-in, and everything about it is built so that a driver who never
turns it on has the app they had before — not a version of it with a switch
turned off.

The distance a driver types always wins. `journeyDistance()` resolves in the
order override → odometer pair → GPS, so a measurement fills a gap somebody
left and never corrects somebody who bothered to type. The close wizard
*suggests* the measured figure in the kilometres field; accepting it is the
driver's act, which is why an accepted suggestion is stored as
`distance_override` and the raw measurement stays beside it in `distance_gps`.

The polyline lives in its own table rather than in a column on `journeys`, and
that shape is the privacy design as much as the storage one: the drawings can
be deleted, or expire on a schedule, without touching a single financial row.

Native modules are kept out of the web bundle **structurally**, not by a
runtime check. `locationService.ts` and `RouteReplay.tsx` are the web
implementations and the modules TypeScript resolves; Metro prefers the
`.native` sibling on a device. MapLibre and `expo-task-manager` are imported
only from `.native` files, so the web dependency graph cannot contain them —
and CI asserts that positively by grepping the exported bundle.

| Rule | Enforced by |
| --- | --- |
| nothing is captured without consent | `capturePermitted()`, read from the database at every start |
| a route belongs to the journey's owner | RLS `with check` that also verifies journey ownership |
| deleting a journey deletes its route | `on delete cascade` |
| old routes expire without the app opening | `prune_expired_routes()` on `pg_cron` |
| the web bundle has no native modules | platform extensions + a CI grep of the export |
| a shared image never shows the driver's door | `trimRouteEnds()`, applied only on the way out |

## Deliberate omissions

No `.mp4`. The "video" is an animated replay inside the app, and what leaves
the phone is a PNG. Generating video would mean a native encoder, a temporary
file the size of a shift, and a second rendering path to keep in step with the
first — for something a story frame does not need.

No map tiles in the shared image. The card is entirely SVG: one code path on
all three platforms, and no question about redistributing somebody else's
basemap.

No generative AI anywhere in the financial path. Every number and every insight
sentence comes from arithmetic a driver could redo on paper.
