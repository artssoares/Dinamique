# Design system

## Brand colours

Taken from the logo. Both are the **500** step of a ten-step ramp; every other
step is a tint or shade of the same hue, never an independently chosen colour.

| Role | Hex | RGB |
| --- | --- | --- |
| Blue 500 — primary | `#0137F7` | 1, 55, 247 |
| Coral 500 — accent | `#FF6A54` | 255, 106, 84 |
| White | `#FFFFFF` | 255, 255, 255 |

Neutrals carry a faint blue cast so white surfaces sit next to the brand blue
without reading grey-green.

## How colour is used

| Colour | For |
| --- | --- |
| Blue | identity, active navigation, primary actions, progress, focus |
| Coral | highlights, badges, small points of attention, microinteractions |
| Green | **profit, success, completed — meaning only** |
| Red | **expense, error, important alert — meaning only** |
| Amber | warnings |

Green is never the interface's primary colour. White dominates; blue and coral
are used with intent. A screen that is entirely blue or entirely coral is
wrong.

## Fill versus text

`success`, `danger` and `warning` are **fill** colours — bars, dots, badges.
The `successText`, `dangerText` and `warningText` variants are the only ones
safe to render type in.

This split is not stylistic. A colour vivid enough to fill a shape rarely clears
WCAG AA as small text: `#12A757` on its own subtle background measures 2.86:1.
`packages/ui/src/tokens/tokens.test.ts` asserts every text token clears 4.5:1
on both its subtle background and the surface, in light and dark. That test
caught the original palette and is why the split exists.

## Semantic tokens

Components consume only these names. A raw hex in a component is a bug, because
it cannot follow the theme.

```
backgroundPrimary   backgroundSecondary
surfacePrimary      surfaceSecondary     surfaceElevated   surfaceHover
surfaceInverse      surfaceInverseHover  textOnInverse     textOnInverseMuted
navSurface          navSurfaceActive     navText           navTextActive
textPrimary         textSecondary        textMuted         textInverse   textOnBrand
borderPrimary       borderSubtle         borderStrong
brandPrimary        brandPrimaryHover    brandPrimarySubtle
brandSecondary      brandSecondaryHover  brandSecondarySubtle
heroFrom  heroTo    heroBackFrom  heroBackTo
success  successSubtle  successText
danger   dangerSubtle   dangerText
warning  warningSubtle  warningText
overlay  overlayStrong  skeleton       focusRing
```

Both themes define every key — asserted by test, so a token cannot exist in one
theme and be missing from the other.

### The three "loud surface" families

`surfaceInverse` **inverts**: it is near-black in light mode and near-white in
dark, so a component keeps its "this one shouts" role in both. The segmented
control's selected pill uses it.

`navSurface` does **not** invert. The tab bar stays dark in both themes, because
a white bar glowing at the bottom of a dark screen is glare in a car at night —
which is precisely when the app is open. `navSurfaceActive` is the light pill on
it, and the token test asserts both pairs clear AA.

`heroFrom`/`heroTo` and `heroBackFrom`/`heroBackTo` are the two gradients of the
Home card stack. Both stops are asserted against white type, which is why the
back card uses Coral 700→600 rather than the lighter steps — Coral 400 measures
2.4:1 against white and cannot carry a label.

## Contrast, and what changed

The muted grey was Neutral 400, which measures 2.86:1 on white: legible on a
desk, invisible on a phone at arm's length in daylight. It is now Neutral 500,
and `borderPrimary` moved from Neutral 200 to 300 for the same reason. Both
floors are asserted:

- every text token clears AA on its background — as before
- `textMuted` clears the large-text floor (3:1), in both themes
- borders clear 1.35:1 against the surface they divide
- `textOnInverse`, `navText`, `navTextActive` and both hero gradients are
  asserted too, because navigation going unreadable is not a cosmetic failure

## Dark mode

Built from the 850–950 neutrals, never absolute black. Brand steps lift (Blue
400, Coral 400) so they stay legible without glowing. Subtle backgrounds become
low-alpha overlays rather than solid tints.

## Scales

**Spacing** is a 4pt grid: 2, 4, 8, 12, 16, 20, 24, 32, 40, 56, 72.

**Radius**: 8, 12, 16, 20, 24, 32, and `pill` (999). Generous, but only chips,
round buttons and the tab bar are fully pill-shaped.

**Breakpoints** — `compact` 360, `regular` 400, `medium` 600, `expanded` 900.
Read through `useResponsive()`, never by comparing a raw width. Above `medium`
content stops stretching and centres inside `layout.maxContentWidth` (560), so
a tablet or a browser window shows a readable column instead of one card three
feet wide. `layout` also carries the tab bar's height, which is how screens
know how much room to leave under themselves.

**Type** — financial figures get their own oversized steps, because the number
must land before anything else on the screen:

| Token | Size / line | Use |
| --- | --- | --- |
| `moneyHero` | 36 / 40 | the headline figure on Home |
| `moneyLarge` | 28 / 32 | section totals |
| `moneyMedium` | 22 / 26 | metric tiles |
| `titleLg` / `title` | 24 / 20 | screen and card titles |
| `body` / `bodyStrong` | 15 | everything else |
| `caption` / `captionStrong` | 13 | labels and hints |
| `overline` | 11 | section headers, badges |

**Motion**: 90ms instant, 160 fast, 240 base, 340 slow, 700 for the currency
count-up. Nothing longer — asserted by test.

## Icons

A 24×24 stroke set (`Icon`, `IconName`) drawn on one grid: 1.8 stroke, round
caps, fills only where a shape must read solid at 16dp. It replaces the unicode
glyphs the app used to draw for navigation and chevrons (`◎ ▤ ◈ ⋯ ›`), which
rendered at a different weight, size and baseline on every device — the single
biggest reason the interface looked homemade. Icons take their colour from the
`color` prop, defaulting to the current text colour; an icon never needs a hex.

## Components

**Layout** — `Screen` · `ScreenHeader` · `SectionHeader` · `Divider` · `Sheet`

**Content** — `Text` · `Card` · `HeroCard` · `Gradient` · `Money` · `Metric` /
`CurrencyMetric` · `StatTile` · `GoalProgress` · `ProgressRing` · `EmptyState` ·
`InsightCard` · `ListRow` · `Skeleton` · `Avatar` · `Badge` / `CountBadge`

**Controls** — `Button` · `IconButton` · `Chip` · `SegmentedControl` ·
`OptionCard` · `Field` · `AmountInput` · `Select` · `StepProgress`

Several carry product rules rather than only style:

- **`Metric`** and **`StatTile`** take `value: string | null`. Null renders a
  dash and an explanation ("sem km"), never a zero.
- **`GoalProgress`** and **`ProgressRing`** clamp to 100% and animate on mount,
  because a static shape reads as a picture while a growing one reads as
  progress.
- **`Screen`** owns safe-area padding, the keyboard avoider and the responsive
  column, so no screen re-derives them. `tabBarSpacing` also lifts the pinned
  footer clear of the floating bar.
- **`ScreenHeader`** makes the back control part of the screen. The root stack
  runs with `headerShown: false`; the app previously set `<Stack.Screen
  options={{ title }} />` from each screen anyway, so those titles were being
  set on a header that never rendered — which is why Metas, Perfil, Plano and
  the cost screens had no way back except a swipe.
- **`OptionCard`** exists because onboarding used chips, which is a lot of
  precision to ask of someone answering questions one-handed in a parked car.
  Selection is carried by a border, a tint *and* a check mark.
- **`Gradient`** draws its fill with `react-native-svg` rather than a native
  gradient module, so it adds no dependency and behaves the same on iOS,
  Android and web. Each instance generates its own gradient id — on the web all
  SVG defs share one document, and a fixed id makes the second card on a screen
  paint with the first card's colours.

## Navigation

The tab bar is a floating pill that clears the bottom edge, not a strip pinned
to it. Only the active destination carries its label, and the pill animates its
width, which is what lets five destinations fit without crowding. The centre
action keeps its brand fill in every state — it is what the app is for — so
"you are here" is said with a ring instead of a colour change.

The header is fixed and deliberate: a menu control on the left, the bell and
the user's own photo on the right. The photo is the largest, right-most element
because "that is me, and this is my account" is the one thing a header has to
communicate without a label.

## The tour

Coach marks, not a card in the corner. The screen dims, the control the step
talks about stays lit inside a cut-out — a real hole punched with an even-odd
SVG fill, not a lighter patch — and the text sits against it, flipping above
the highlight when there is no room below. Each step moves the cut-out, so
people learn *where* things are rather than only that they exist.

Copy lives in `tour_steps` and is editable by the admin. The anchor cannot: an
admin can write new text but cannot invent a control, so slugs map to UI keys
in the app (`TARGET_BY_SLUG`). A step with no mapped or mounted target still
shows, centred and without a cut-out, rather than pointing at nothing.

## Motion principles

Small and purposeful: numbers count up, progress bars grow, cards fade in,
buttons scale slightly on press, skeletons pulse. No confetti, no long
transitions, nothing that costs a frame on a mid-range Android.

## Accessibility

- every text token clears WCAG AA, asserted in both themes
- muted text, borders, the tab bar and both hero gradients are asserted too
- minimum touch target 44dp — `IconButton` adds hit slop when drawn smaller
- state is never carried by colour alone — the unread notification has a border
  *and* a badge; an internal note has a dashed border *and* a label
- accessibility labels on every control; `accessibilityRole="progressbar"` with
  real values on goal bars and rings
- every pushed screen renders its own back control, so leaving never depends on
  knowing the edge-swipe gesture
- visible focus rings in the admin for keyboard navigation

## The admin

The panel mirrors the same token values as CSS custom properties in
`apps/admin/src/app/globals.css`, including the dark-mode block. It does not
import `@dinamique/ui`, which is React Native only. `packages/ui` remains the
source of truth for the values; the admin's copy is a mirror, and the token
tests guard the originals.
