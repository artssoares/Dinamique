# Referrals, influencers and codes

## One code table, not three

Referral codes, influencer codes and campaign codes share the same lifecycle:
they are validated, they may expire, they may have a use limit, and they grant a
benefit. They therefore share one table, `promotion_codes`, discriminated by
`kind`:

`referral` · `influencer` · `campaign` · `partnership` · `promotion`

Three parallel implementations would drift apart within a quarter. One table
means a new campaign type is a row, not a migration.

## Personal referral codes

Every user gets one at signup, inside the same transaction that creates their
profile: their first name plus two characters, e.g. `ARTHUR26`. Ambiguous
characters (0/O, 1/I/L) are excluded so a code survives being read aloud or
typed from a screenshot.

A unique partial index guarantees exactly one referral code per user.

## The benefit

The **referred** user receives **R$ 10** off their first eligible Pro charge.
The referrer receives nothing automatically.

That is a commercial decision rather than a technical one, and the copy in the
app says so plainly instead of implying a reward that does not exist. The schema
already supports referrer-side benefits — `discount_benefits` is keyed by user,
not by role — so adding one later is a rule change, not a rebuild.

Configured in `app_settings`:

| Key | Default | Meaning |
| --- | --- | --- |
| `referral_discount_amount` | `1000` | benefit in cents |
| `referral_benefit_validity_days` | `90` | how long it stays redeemable |
| `referral_remainder_policy` | `"forfeit"` | what happens when the bill is smaller than the discount |

A discount never produces a negative charge.

## Redemption

`redeem_code(p_code)` is a `SECURITY DEFINER` function. The client cannot write
to `referrals`, `discount_benefits` or `user_attribution` at all — it has no
grant. Every rule runs server-side in one transaction:

| Rejection | Reason |
| --- | --- |
| `not_found` | no such code |
| `inactive` / `expired` / `exhausted` | the code is not usable |
| `not_started` | scheduled for later |
| `self_referral` | you cannot use your own code |
| `already_attributed` | this account already used one |
| `referrer_blocked` | a blocked referrer earns nothing |

On success it creates the referral, grants the benefit, writes first-touch
attribution, increments the counter (marking the code exhausted if it hit its
limit) and records a `promotion_code_used` event.

The identical rules exist in `packages/business-logic/src/codes.ts` so the app
can validate a code before submitting and show the same message the server
would. The database remains the authority.

## Attribution is first-touch

`user_attribution` has one row per user, written once. A `before update` trigger
raises an exception rather than allowing an overwrite — the first relevant
origin of a signup is preserved by construction, not by remembering to check.

## Antifraud (V1)

- self-referral: check constraint on `referrals`, plus `redeem_code`, plus the
  business-logic validator
- one attribution per account: `user_attribution` primary key
- one referrer per referred account: unique constraint on `referrals`
- one benefit per referral: unique partial index on `discount_benefits`
- expired and exhausted codes rejected
- blocked referrers earn nothing

All of these are asserted in `packages/database/test/rls_test.sql`.

Nothing heavier ships in V1. A more elaborate system without real abuse data
would be guesswork, and the structure above extends cleanly.

## "Minhas indicações"

The `my_referrals` view exposes **first name, date and status only**. The
referred user's email, city, plan and earnings are not visible to the person
who invited them.

## Influencers

`Mais → Seja um Influencer` submits an application; the user then sees their
status and, once approved, their code.

Approving in the panel is one Server Action that creates the influencer record,
issues a code (auto-generated or admin-specified), updates the application, and
notifies the user — then writes an audit entry.

**No automatic commission payment.** The structure supports attribution and
conversion tracking per influencer; paying out is a commercial rule that does
not exist yet, and inventing one in code would be worse than waiting.

## Not built yet

- acquisition analytics per source/influencer/campaign (§90, §96, §97) — the
  attribution data is captured and queryable; no page renders it
- the influencer's own dashboard of clicks and conversions
- click tracking on referral links (signups are attributed; clicks are not)
- XLSX/CSV export of referral data
