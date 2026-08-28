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

One address, always the same one. It serves the latest `main`, so it does not
change per branch and does not have to be rediscovered every session:

- app: https://dinamique-mobile.vercel.app
- admin: https://dinamique.vercel.app

Hand over that link, not a branch preview. Per-branch preview URLs exist for
reviewing a pull request and change every time, which is exactly the swapping
this is here to avoid.

The two Vercel projects live in different scopes, `dinamique1/dinamique-mobile`
(root `apps/mobile`) and `feed-on-track/dinamique`, which is why listing
projects in one scope comes back empty.

## Check the base before starting

`git log --oneline origin/main -1` before writing anything. A session has
started from a stale clone whose base was not an ancestor of `origin/main`,
and the work was a reimplementation of a feature that already shipped. If the
checkout does not descend from `origin/main`, rebase onto it first.
