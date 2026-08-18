# Demo data

**Development and demo only.** Every profile created here is marked
`is_demo = true`, and `demo_teardown()` removes all of it. None of it may reach
production.

```bash
psql -d <database> -f seed/001_demo.sql
psql -d <database> -c 'select demo_teardown();'
```

## What it creates

- **Arthur Soares** — São Paulo, Honda Civic 2020, Uber + 99, ~30 days of
  history with Sundays off and Fridays strongest, fuel logs every five days
  with a rising odometer so measured consumption becomes computable
- **24 peer drivers** across six cities and three modalities, two weeks each
- a support ticket mid-conversation, including an internal note
- an influencer application awaiting review
- referrals and discount benefits, some used
- a campaign code

Variation is deterministic — derived from the day and user index — so a reseed
produces identical data. Nothing here calls `random()`.

## It demonstrates the benchmark gate working

With 25 users the national pool clears the 20-user minimum and produces a
median (~R$ 2,28/km). Every per-city bucket has 4–5 users and therefore
produces **nothing at all**, which is the rule from `PRODUCT_RULES.md` behaving
correctly rather than a gap in the data.

To exercise city-level benchmarks, raise the peer loop past 20 users per city.
