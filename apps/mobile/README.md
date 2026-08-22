# @dinamique/mobile

Expo Router app for iOS, Android and Web.

## Running

```bash
cp .env.example .env      # fill in your Supabase URL + anon key
pnpm --filter @dinamique/mobile start
```

Only `EXPO_PUBLIC_*` keys belong here. The Supabase **anon** key is public by
design and useless without a session, because every table is behind Row Level
Security. The service role key must never appear in this app.

## Route map

| Route | State |
| --- | --- |
| `(auth)/sign-in`, `(auth)/sign-up` | built — sign-up captures a referral code |
| `onboarding` | built — work modes, platforms, monthly goal |
| `(tabs)/index` — Hoje | built — goal progress, profit, R$/hour, R$/km |
| `(tabs)/history` — Histórico | built — day list with period totals |
| `(tabs)/record` — + | built — journey start/pause/finish, revenue, expense |
| `(tabs)/insights` — Insights | built — rule-based insights |
| `(tabs)/more` — Mais | built — hub |
| `support`, `support/new`, `support/[id]` | built — inbox, new ticket, live conversation |
| `notifications` | built — list, deep links, mark all read |
| `referrals` | built — code, native share, "minhas indicações" |
| `influencer` | built — application form and status |
| `settings/appearance` | built — light / dark / system |
| `settings/route` | built — Trajeto e privacidade: GPS, cortar as pontas, retenção, apagar tudo |
| `journey/close` | built — três passos, resumo, replay e compartilhar |
| `journey/replay` | built — o trajeto de um dia, vindo do histórico |
| `profile`, `vehicle`, `goals`, `plan`, `export` | **not built** — each renders `<ComingSoon>` naming its phase |

Routes marked *not built* say so on screen. A button that looks finished but
does nothing is worse than an honest empty state (§131).

## Platform extensions

Three modules exist twice: `locationService`, `backgroundTask` and
`RouteReplay`. The bare `.ts`/`.tsx` is the **web** implementation and the one
TypeScript resolves; Metro prefers the `.native` sibling on a device.

That direction is the whole point. TypeScript knows nothing about platform
extensions, so a pair of `.web` and `.native` files would not compile at all.
With the bare file as the web one, the compiler, the web bundler and the
native bundler all agree — and MapLibre and `expo-task-manager`, imported only
from `.native` files, cannot enter the web dependency graph. CI greps the
exported bundle to prove it.

## Where logic lives

No screen does arithmetic. Money, goals, projections, the daily score and
vehicle economics all come from `@dinamique/business-logic`, and colours and
type come from `@dinamique/ui` tokens. A hex code in a screen is a bug.

## Known gaps

- **Icons** are placeholder glyphs in the tab bar, not a finished icon set.
- **The logo** is not in the repository; `<BrandMark>` renders a visible
  placeholder until `assets/brand/logo.png` is supplied.
- **Offline queueing** (§111) is not implemented. Writes go straight to
  Supabase; `client_id` columns exist so idempotent sync can be added without a
  migration.
- **Push notifications** are not wired. In-app notifications work end to end.
- **No native build has ever been produced.** Background location, the Android
  foreground service, the MapLibre replay and the PNG export are written and
  typechecked but have never run on a device. Config plugins do nothing in
  Expo Go — they need `expo prebuild`, which needs the app icons that are also
  missing.
