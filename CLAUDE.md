# Working on Dinamique

## Copy

**Never use an em-dash.** Not in interface copy, not in comments, not in
documentation, not in commit messages. The character is banned from this
project in every form. A comma, a full stop, a colon or a pair of brackets
always carries the same pause.

The lone dash that stands for "no value" in a table cell or a metric is an en
dash, not an em dash.

**Never use sparkle or star iconography.** No twinkles, no wands, nothing that
reads as an "AI" badge. Icons describe the thing they label: a wallet is money,
a fuel pump is fuel, a target is a goal.

Copy is written for a driver reading a phone at a traffic light: short
sentences, everyday words, and the point first. "Quanto sobrou" rather than
"resultado líquido operacional".

## Design

`DESIGN_SYSTEM.md` is the reference. Two rules that get broken most often:

- A raw hex in a component is a bug. Colour comes from the semantic tokens, so
  it can follow the theme.
- A metric with no denominator renders an en dash and an explanation, never a
  zero. An invented number is worse than no number.

Motion is expected, not optional. Screens, tabs and sheets move rather than
cut, and a control that responds to a press says so.

## Money and metrics

Money is integer cents at every layer, never a float. Every calculation lives
in `packages/business-logic`, tested, and never inside a screen.

## Before pushing

`pnpm typecheck` and `pnpm test` both green. CI additionally builds the admin
and bundles the mobile app for web, which is what catches monorepo resolution
problems that typecheck cannot see.

## Where to test

Two Vercel projects, and only these two. There is no `dinamique-app`.

| Project | Address | Publishes |
| --- | --- | --- |
| `dinamique-mobile` | https://app.dinamique.com.br | `main` |
| `dinamique-admin` | https://dinamique-admin.vercel.app | the repository default branch |

The app lives on its own domain, not on a `.vercel.app` address. Hand over that
domain, not a branch preview: per-branch previews exist for reviewing a pull
request and change every time.

The two projects sit in different Vercel scopes, `dinamique1/dinamique-mobile`
(root `apps/mobile`) and `feed-on-track/dinamique`, which is why listing
projects in one scope comes back empty.

**The repository default branch is `claude/dinamique-support-tickets-gfdh4o`**,
from August, not `main`. Two consequences that have already cost a day of work:
the admin panel publishes old code, and a fresh session starts from a tree with
no map, no route capture and none of the recent pull requests, which is enough
to conclude with full confidence that those features were never built.

To reach the film in the app: **Histórico, then tap a day**. The day screen
lists every journey of that day that has a `journey_routes` row, one card per
journey, and each card is the film itself, already playing: the route drawn
over satellite imagery with the camera turning along the road, and the
journey's numbers at the end. Tapping the card grows it to full screen from
the same frame; **Compartilhar vídeo** under it records and shares the file.
The close-journey summary links to the same film (`/journey/film/[id]`) once
the route has been saved. The film is `packages/recap`; `pnpm --filter
@dinamique/recap run preview` writes it as a standalone HTML file to look at
in a browser.

Every test account carries a copy of the demo journey (`note = 'demo-recap'`,
33 km, 769 points), kept on today's date by a daily job. A new test account
gets its own copy with `select clone_demo_journey(id) from auth.users where
email = '...'` (see `packages/database/seed/002_demo_route.sql`). Without it,
a fresh account opens Histórico, sees no map, and concludes the map is not
published.

The film was built in late August, on a branch that started from the stale
default branch, and its commits were dropped before the branch reached `main`.
The "HTML file with the map animation" people remember is that film's preview.
It is on `main` now; do not rebuild it.

### The build cache poisons the keys

Metro substitutes `process.env.EXPO_PUBLIC_*` while it transforms a file, and
the substituted value is not part of the transform cache key. A warm cache
therefore reuses whatever value it saw first, in both directions: a build with
the keys set can ship without them, and a build with no keys at all can ship
the previous build's. With Vercel's build cache on, one bad first build sticks
for every deployment after it.

This shipped. `app.dinamique.com.br` served the "Falta conectar o banco de
dados" screen, with the map off for the same reason, while the deployment log
said success and `vercel.json` held all three keys.

The build command carries `--clear` for this, and CI greps the exported bundle
for the three `EXPO_PUBLIC_` values it built with. An export that succeeds
proves nothing here: a missing key compiles perfectly.

## Check the base before starting

`git log --oneline origin/main -1` before writing anything. A session has
started from a stale clone whose base was not an ancestor of `origin/main`,
and the work was a reimplementation of a feature that already shipped. If the
checkout does not descend from `origin/main`, rebase onto it first.
