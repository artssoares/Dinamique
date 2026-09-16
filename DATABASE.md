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
| instants | `timestamptz` | – |
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
| `20260821000100_journey_gps_routes` | `journey_routes`, GPS columns on `journeys`, route preferences, retention |
| `20260916000100_sos_safety_network` | PostGIS, `emergency_contacts`, `driver_locations`, `sos_alerts`, the SOS functions |

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

`anon` receives nothing – every screen requires a session.

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
  insertable – a user cannot write themselves a notification
- **analytics_events** is insert-only for users and readable only by admins with
  the analyst role

### Functions that grant value

`handle_new_user()` – on `auth.users` insert, creates the profile, preferences,
the 7-day Pro trial, the personal referral code and notification preferences, in
one transaction.

`redeem_code(text)` – every antifraud rule from `REFERRALS.md`, server-side, in
one transaction. Executable by `authenticated`, revoked from `public`.

`mark_ticket_read(uuid)` – marks a ticket's messages and its matching
notifications read, after verifying the caller owns the ticket.

## Read models

| View | Grain | Used by |
| --- | --- | --- |
| `current_plans` | one row per user | plan gating in both apps |
| `daily_totals` | one row per user per calendar day | Home, history, insights, dashboard |
| `my_referrals` | referrer's own referrals, first name only | "Minhas indicações" |
| `notification_counts` | unread totals per user | bell and support badges |

`daily_totals` resolves a journey's distance as
`coalesce(distance_override, odometer pair, nullif(distance_gps, 0), 0)`. That
order must stay byte-for-byte equivalent to `journeyDistance()` in
`packages/business-logic/src/financials.ts` — the app reads the function and the
history reads the view, and a divergence shows the same day two ways. A
database assertion covers all three branches.

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

### `journey_routes`

The most sensitive table in the schema: a route says where a person was, hour by
hour. It is treated accordingly.

- **Opt-in.** `user_preferences.route_capture_enabled` defaults to `false`.
  Nothing is captured until the driver turns it on, and turning it off stops
  capture immediately.
- **Deletable on its own.** "Apagar todos os meus trajetos" is one
  `delete from journey_routes where user_id = ?`, plus a wipe of the device
  buffer. The km and the money stay in the driver's history — only the drawing
  of the path goes. This is why the polyline is not a column on `journeys`.
- **Expires by default.** `route_retention_days` is nullable with `default 90` —
  the column carries the default, not the app, because leaving it to the client
  meant every row read as "keep for ever" and the retention promised here never
  happened for anyone. Null still means "guardar para sempre", but it is
  reachable only as a deliberate choice in the settings.
  `prune_expired_routes()` skips null and enforces the rest on a schedule; the
  migration registers it with `pg_cron` where the extension exists and says so
  in its output where it does not (SETUP.md §8).
- **Never aggregated.** Route data does not feed the benchmark, does not appear
  in exports, and never leaves the owner's own rows.
- **Trimmed before it is shared.** The app removes up to the first and last
  500 m — capped at a tenth of the route, and measured by straight-line
  displacement rather than distance walked, so a lap around the block does not
  count as hiding anything. The trim fails closed: a route too short or too
  tangled to trim is not shareable at all, rather than shareable with its
  endpoints intact.

### The SOS tables

`driver_locations`, `sos_alerts`, `sos_alert_recipients` and
`emergency_contacts` are the other place where the schema stores where somebody
is. The rules, all asserted in `test/rls_test.sql`:

- **Consent gates the feature, in the function.** `sos_trigger` raises
  `sos_consent_required` while `user_preferences.sos_consent_at` is null. The
  screen shows the consent text; the database is what refuses.
- **Nobody reads another user's position.** `driver_locations` has one policy,
  `user_id = auth.uid()`, with no admin exception. The proximity search is
  `sos_nearby_drivers`, a `security definer` function that returns user ids and
  distances and never a coordinate, and it is not executable by
  `authenticated`, because answering "how many drivers are around this point"
  for an arbitrary point is a map of the user base built one query at a time.
- **An alert is readable by the people it woke, while it is live.** The policy
  on `sos_alerts` is owner, admin, or `status = 'active' and expires_at > now()`
  and a matching `sos_alert_recipients` row. Ending, cancelling or expiring the
  alert closes that window; the row itself stays, because it is the audit
  record.
- **The recipient list is not the owner's.** `sos_alerts.notified_count` tells
  the driver how many people were reached. Who they are is the list of who was
  nearby, and no policy gives it to them. (It is also what made the first
  version of the two policies recurse into each other. See the comment in the
  migration.)
- **Emergency contacts are readable by their owner alone.** No `is_admin()`
  clause, unlike every other user-owned table: it is a third party's phone
  number, and that person never used the app or agreed to anything. Asserted,
  so a later copy-paste of the usual policy shape fails the test.
- **Thirty minutes, enforced without the app.** `sos_expire_alerts()` flips
  live alerts past `expires_at` to `expired` and deletes stale presence rows. It
  is service-role only and scheduled with `pg_cron`, so the promise holds even
  if the driver's phone died mid-alert.
- **The limits are the database's.** One alert per 10 minutes, three per
  calendar day in `America/Sao_Paulo`, counted inside `sos_trigger`. Alerts
  cancelled during the five-second countdown are recorded and count towards
  neither limit.
- **Only three letters of the plate exist.** `user_preferences.sos_plate_prefix`
  is `check (~ '^[A-Z]{3}$')`. It is not a mask over a stored plate: the rest
  was never stored.
