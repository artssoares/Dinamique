# Product rules

Every calculation the product makes, stated plainly enough that a driver could
check it. Each one lives in `packages/business-logic` and is covered by tests.

## Money

Money is an integer number of **cents**. There is no floating-point currency at
any layer – not in the database, not in the API, not in a component.

Rounding is half away from zero, which is how people expect money to round.

## Revenue, expenses and profit

| Term | Definition |
| --- | --- |
| **Faturamento** (gross revenue) | everything that came in: what the platforms paid, tips included, plus anything sold in the car |
| **Despesas** (expenses) | every expense recorded in the period |
| **Lucro estimado** (net profit) | gross revenue − expenses |

Gross revenue is **never** called profit. The distinction is the reason the
product exists.

Net profit is always labelled *estimated*, because recurring costs are
apportioned rather than observed.

### Selling inside the car

Plenty of drivers sell water, sweets, chargers or perfume to the person in the
back seat, and that money is theirs exactly like a fare is. Three rules keep it
honest:

- **A sale is a revenue row**, with `product_id` and `quantity` set and
  `platform_id` null. The database rejects a row that claims to be both, since
  it would be counted twice in the per-platform breakdown. Everything that
  already reads `revenues` – daily totals, goals, insights, history, exports –
  therefore counts sales without being taught to.
- **The goods are a cost**, recorded against the `produtos` category as soon as
  the driver has said what a unit costs them. A perfume bought for twenty and
  sold for fifty is thirty of profit, not fifty, and the app never shows the
  flattering number.
- **`produtos` is not a vehicle cost**, so a box of perfume never reaches cost
  per kilometre. The car did not get more expensive to drive.

A driver who says they sell nothing is never shown any of it. Sales are never
counted as trips: three perfumes are three units, not three rides, so ticket
médio stays a fare average.

## Metrics that can be null

A metric whose denominator is missing returns `null`, and the UI renders a dash
with a short reason. It never returns zero, and it never invents a figure.

| Metric | Formula | Null when |
| --- | --- | --- |
| R$/hora (revenue) | gross ÷ worked hours | no worked time |
| R$/hora (profit) | net ÷ worked hours | no worked time |
| R$/km (revenue) | gross ÷ km | no distance recorded |
| R$/km (profit) | net ÷ km | no distance recorded |
| Custo/km | vehicle-attributable costs ÷ km | no distance recorded |
| Ticket médio | gross ÷ trips | no trip count recorded |

**Worked time** excludes paused intervals. An unfinished journey contributes
nothing – only what closed is measured.

**Distance** resolves in this order: an explicit "how many km did you drive"
override, then an odometer pair where the end exceeds the start. A single
odometer reading is not a distance.

## Vehicle costs

Only **vehicle-attributable** expenses feed cost-per-km. The
`expense_categories.is_vehicle_cost` flag decides: fuel, tolls, tyres and
maintenance count; a meal and a phone bill do not. A meal is a cost of working,
not a cost of running the car, and letting it inflate R$/km would make the
number useless.

Recurring costs (rent, financing, insurance, IPVA) are stated once per period
and apportioned proportionally across a window: weekly ÷ 7, monthly ÷ 30,
yearly ÷ 365, times the number of days. This is explicitly an estimate.

### Consumption

The catalogue estimate is used until the driver **explicitly accepts** a
measured figure. Consumption is never switched silently.

Measured consumption is tank-to-tank: distance between consecutive odometer
readings ÷ the volume that covered it. It needs at least 3 fuel logs with both
an odometer and a volume; below that it returns nothing. We only offer to
switch when the measured figure differs from the estimate by ≥ 8%.

## Goals

Goals are per period (daily, weekly, monthly, yearly) and measure either gross
revenue or net profit. Progress is clamped to 0–100%, so a bar never overflows.

- **Remaining** = max(0, target − achieved)
- **Required per remaining day** = remaining ÷ days left. With no days left the
  whole shortfall is due today, not divided by zero.
- **Pace per day** = achieved ÷ days elapsed (elapsed counts inclusively)
- **Projected total** = pace per day × days in period
- **On track** = projected total ≥ target

Suggested targets from a monthly goal: daily = monthly ÷ 30, weekly = monthly ÷
4.345 (mean weeks per month), yearly = monthly × 12.

### Time to goal

"No ritmo de hoje, faltam cerca de 2h05" uses the rate observed *today*:
remaining ÷ (earned today ÷ seconds worked today). Without worked time or
earnings there is no rate, and the app says nothing.

## Projections

Projections are linear extrapolations of the observed pace and are always
labelled as estimates. Fewer than **3 days** of data in the period means no
projection is shown.

The estimated goal-reach date is today + ⌈remaining ÷ pace per day⌉, and is
withheld if that date falls outside the period.

## Nota do dia (0–10)

A weighted mean of whichever components can be measured, renormalised over the
ones available. A component with no data is **dropped**, not defaulted to zero,
so a driver with no odometer is not punished for it.

| Component | Weight | Value |
| --- | --- | --- |
| Goal progress | 4 | achieved ÷ target, capped at 1 |
| Profit/hour vs personal average | 3 | clamp(today ÷ average ÷ 2, 0, 1) |
| Profit/km vs personal average | 2 | clamp(today ÷ average ÷ 2, 0, 1) |
| Expense ratio vs personal average | 1 | clamp(1 − today ÷ average ÷ 2, 0, 1) |

The ÷ 2 places "matched your own average" at 0.5, so beating your average
scores above the midpoint. Score = (Σ weight × value ÷ Σ weight) × 10, to one
decimal.

Labels: ≥ 8.5 excellent, ≥ 7 good, ≥ 5 average, ≥ 3 below average, else hard day.

## Benchmark

Anonymous and aggregate only. Two hard rules:

1. A bucket with fewer than **20 users** produces nothing at all – not a blurred
   figure, not a caveated one. Nothing.
2. Only medians and sample sizes leave the aggregation. No individual row of
   another user is ever visible to a user.

The minimum is admin-configurable upward but never downward.

## Insights

Rule-based sentences, not generated text. Each rule is a pure function of two
period summaries and a threshold, so the same inputs always produce the same
sentence.

| Rule | Fires when |
| --- | --- |
| profit/hour trend | changed by ≥ 5% vs the previous period |
| worked less, earned more | less time worked *and* more profit |
| fuel share | fuel ≥ 20% of gross revenue |
| cost/km trend | changed by ≥ 5% |
| best weekday | ≥ 3 distinct weekdays of data |
| weekday below average | that weekday is ≥ 10% below the overall average |
| goal streak | ≥ 3 consecutive days hitting goal |

Thresholds live in `insight_rules` and are admin-tunable. Insights need at
least 5 days with records before any are shown.

## Maintenance reserve

A suggestion, never a movement of money. Sized from the driver's own history:
(historical maintenance cost ÷ historical distance) × today's distance, capped
at today's profit. Nothing is suggested on a loss-making day or without
distance.

## Plans and trial

Every new account gets **7 days of Pro**, granted in the signup transaction.
When it expires the account becomes Free – never locked out.

A user may hold several grants at once. The effective plan is the most generous
currently-valid one, ranked: subscription > partnership > courtesy > promotion >
trial. Ties go to the longer grant; open-ended beats dated.

Free keeps the entire core loop: journeys, revenues, expenses, fuel, the daily
goal, basic history, support and referrals. Pro adds depth – unlimited history,
advanced insights, benchmark, projections, exports, multiple vehicles and
recurring costs. We restrict depth, not access.

## Referral benefit

The **referred** user receives **R$ 10** off their first eligible Pro charge.
The referrer receives nothing automatically; that is a commercial decision, and
the schema is ready for it when the rule exists.

A discount never produces a negative charge. When the bill is smaller than the
discount, the configured `referral_remainder_policy` decides: `forfeit`
(default) consumes the benefit, `keep_remainder` leaves the difference
available.

Benefits expire after 90 days by default and can be used exactly once.

## Antifraud (V1)

Deliberately simple, and enforced in the database rather than the client:

- you cannot redeem your own code (check constraint + `redeem_code`)
- an account can hold exactly one attribution, forever (unique constraint)
- a referred account can only ever have one referrer (unique constraint)
- a benefit is consumed at most once
- expired, inactive and use-limit-exhausted codes are rejected
- a blocked referrer earns nothing

Anything heavier belongs in a later version informed by real abuse data.

## Support

Ticket status is derived from events, never set freehand, so the inbox counters
cannot drift.

| Event | Result |
| --- | --- |
| created | `new` |
| assigned | `new` → `awaiting_agent` |
| agent replied | `awaiting_user` |
| user replied | `in_progress` (from `resolved` → `awaiting_agent`) |
| resolved | `resolved` |
| closed | `closed` |
| reopened | `awaiting_agent` |

A closed ticket only moves again through an explicit reopen. Tickets awaiting
the team (`new`, `awaiting_agent`, `in_progress`) drive the unanswered counter.

Time to first response and time to resolution exclude unanswered tickets from
the average rather than counting them as zero.
