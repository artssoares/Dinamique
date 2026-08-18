# Database

Postgres via Supabase. 42 tables, 105 RLS policies, verified by applying every
migration to a real Postgres and asserting behaviour.

## Storage conventions

| Kind | Type | Unit |
| --- | --- | --- |
| money | `bigint` | cents |
| distance | `integer` | metres |
| volume | `integer` | millilitres |
| duration | `integer` | seconds |
| consumption | `integer` | metres per litre |
| instants | `timestamptz` | — |
| calendar days | `date` | local to the driver |

No `numeric` currency and no float distances anywhere. `10.8 km/l` is stored as
`10800`.

## Migrations

| File | Contents |
| --- | --- |
| `…000100_extensions_and_enums` | extensions, domain enums, `set_updated_at` |
| `…000200_identity_and_catalogue` | profiles, preferences, platforms, vehicle catalogue, categories |
| `…000300_operations` | journeys, revenues, expenses, fuel, maintenance, goals, fines, Free Flow, scores |
| `…000400_growth_support_admin` | plans, support, codes, referrals, influencers, notifications, admin, analytics |
| `…000500_rls` | auth predicates and every RLS policy |
| `…000550_grants` | table privileges for `authenticated` and `service_role` |
| `…000600_functions_and_views` | signup, `redeem_code`, `mark_ticket_read`, read-model views |
| `…000700_reference_data` | production reference data |

Order matters twice: `is_admin()`/`has_admin_role()` are SQL-language functions
whose bodies validate at creation, so they must come after `admin_users`; and
grants must exist before any policy can be exercised.

## Invariants the database enforces

These cannot be violated by application code, because they are constraints:

| Invariant | Mechanism |
| --- | --- |
| one active journey per user | `journeys_one_active_idx` |
| one primary vehicle per user | `user_vehicles_one_primary_idx` |
| one active goal per period per user | `goals_one_active_per_period_idx` |
| one referral code per user | `promotion_codes_one_referral_per_user_idx` |
| a referred account has exactly one referrer | `unique (referred_user_id)` |
| nobody refers themselves | `referral_not_self` check |
| one benefit per referral | `discount_benefits_one_per_referral_idx` |
| attribution is first-touch | `user_attribution_no_update` trigger |
| odometer end ≥ start | `journey_odometer_increases` check |
| journey end ≥ start | `journey_ends_after_start` check |
| ticket references never collide | sequence, not `count(*)` |

## Security

### Grants

`anon` receives nothing — every screen requires a session.

`authenticated` receives `select` on everything (narrowed to their own rows by
RLS) and write access only where a user legitimately creates their own data.
These tables are **read-only to the client** because they grant value:

`subscriptions` · `promotion_codes` · `referrals` · `discount_benefits` ·
`user_attribution` · `admin_users` · `admin_logs` · `exports`

`service_role` bypasses RLS and exists only in the admin's server environment.

### Policies worth knowing

- **support internal notes** are excluded at row level for the ticket owner, so
  a query that forgets to filter cannot leak one
- **support messages** can only be inserted with `author_kind = 'user'` and
  `author_id = auth.uid()`, on a ticket you own that is not closed
- **notifications** are updatable by their owner (to mark read) but not
  insertable — a user cannot write themselves a notification
- **analytics_events** is insert-only for users and readable only by admins with
  the analyst role

### Functions that grant value

`handle_new_user()` — on `auth.users` insert, creates the profile, preferences,
the 7-day Pro trial, the personal referral code and notification preferences, in
one transaction.

`redeem_code(text)` — every antifraud rule from `REFERRALS.md`, server-side, in
one transaction. Executable by `authenticated`, revoked from `public`.

`mark_ticket_read(uuid)` — marks a ticket's messages and its matching
notifications read, after verifying the caller owns the ticket.

## Read models

| View | Grain | Used by |
| --- | --- | --- |
| `current_plans` | one row per user | plan gating in both apps |
| `daily_totals` | one row per user per calendar day | Home, history, insights, dashboard |
| `my_referrals` | referrer's own referrals, first name only | "Minhas indicações" |
| `notification_counts` | unread totals per user | bell and support badges |

All are `security_invoker = true`, so they respect the caller's RLS rather than
the view owner's.

`daily_totals` is the grain everything downstream is built from. At volume it
becomes a materialised view refreshed on a schedule without changing its query
surface.

## Testing

```bash
supabase start
pnpm --filter @dinamique/database test
```

29 assertions covering signup, trial grant, referral happy path, self-referral,
double redemption, expired and exhausted codes, attribution immutability, RLS
isolation, cross-user writes, internal-note privacy, agent impersonation, admin
visibility and the structural constraints.

`test/supabase_shim.sql` reproduces the `auth` schema for a plain Postgres. It
is a local test fixture and is never applied to a Supabase project.

## LGPD

- account deletion cascades from `auth.users` through every user-owned table
- users can export their own data (the export path is not built yet; the
  `exports` table records every export for audit)
- optional fields (gender, birth date, phone) are nullable and never gate a
  feature
- benchmark participation is an opt-in flag on `user_preferences`
- benchmarks are aggregate-only with a hard 20-user minimum; no user ever sees
  another user's row
