# @dinamique/database

Schema, security policies, server-side business functions and read models.

## Layout

| Migration | Contents |
| --- | --- |
| `…000100_extensions_and_enums` | extensions, domain enums, `set_updated_at` |
| `…000200_identity_and_catalogue` | profiles, preferences, platforms, vehicle catalogue, categories |
| `…000300_operations` | journeys, revenues, expenses, fuel, maintenance, goals, fines, Free Flow |
| `…000400_growth_support_admin` | plans, support, codes, referrals, influencers, notifications, admin |
| `…000500_rls` | `is_admin`/`has_admin_role` + every Row Level Security policy |
| `…000550_grants` | table privileges for `authenticated` and `service_role` |
| `…000600_functions_and_views` | signup, `redeem_code`, read-model views |
| `…000700_reference_data` | production reference data (categories, platforms, settings) |
| `…000800_vehicle_catalogue` | the first makes, models and versions |
| `…819000200_vehicle_catalogue_expansion` | the makes and models drivers actually own |
| `…904000100_vehicle_catalogue_versions` | a version, and so a reference consumption, for every one of them |

## Invariants the schema enforces

These are constraints and policies, not conventions – code cannot violate them.

- money is `bigint` cents; distance is `integer` metres; volume is millilitres
- one active journey per user (`journeys_one_active_idx`)
- one primary vehicle per user (`user_vehicles_one_primary_idx`)
- one active goal per period per user (`goals_one_active_per_period_idx`)
- a referred account has exactly one referrer, and nobody can refer themselves
- `user_attribution` is first-touch: updates raise an exception
- a support internal note is invisible to the ticket owner at row level
- a user cannot post a support message as `agent`
- every catalogue model has at least one version, because the version is what
  carries the reference consumption and a model without one cannot produce a
  cost per kilometre

## Running the tests

```bash
supabase start          # or point PGHOST/PGPORT at any Postgres
pnpm --filter @dinamique/database test
```

`test/supabase_shim.sql` reproduces the `auth` schema for a plain Postgres. It
is a local test fixture and is never applied to a Supabase project.

## Value is granted server-side

Plans, discounts and referrals are never writable by the client. They are
granted by `SECURITY DEFINER` functions (`redeem_code`) or by the service role
from the admin panel. The `authenticated` role holds `select` on those tables
and nothing more – see `…000550_grants.sql`.
