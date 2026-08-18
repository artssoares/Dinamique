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
textPrimary         textSecondary        textMuted         textInverse   textOnBrand
borderPrimary       borderSubtle         borderStrong
brandPrimary        brandPrimaryHover    brandPrimarySubtle
brandSecondary      brandSecondaryHover  brandSecondarySubtle
success  successSubtle  successText
danger   dangerSubtle   dangerText
warning  warningSubtle  warningText
overlay  skeleton       focusRing
```

Both themes define every key — asserted by test, so a token cannot exist in one
theme and be missing from the other.

## Dark mode

Built from the 850–950 neutrals, never absolute black. Brand steps lift (Blue
400, Coral 400) so they stay legible without glowing. Subtle backgrounds become
low-alpha overlays rather than solid tints.

## Scales

**Spacing** is a 4pt grid: 2, 4, 8, 12, 16, 20, 24, 32, 40, 56, 72.

**Radius**: 8, 12, 16, 20, 24, 32, and `pill` (999). Generous, but only chips
and round buttons are fully pill-shaped.

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

## Components

`Text` · `Button` · `Card` · `Money` · `Metric` / `CurrencyMetric` ·
`GoalProgress` · `EmptyState` · `Chip` · `Badge` / `CountBadge` · `InsightCard`
· `Skeleton`

Two of them carry product rules rather than only style:

- **`Metric`** takes `value: string | null`. Null renders a dash and an
  explanation ("sem km"), never a zero.
- **`GoalProgress`** clamps to 100% and animates width on mount, because a
  static bar reads as a picture while a growing one reads as progress.

## Motion principles

Small and purposeful: numbers count up, progress bars grow, cards fade in,
buttons scale slightly on press, skeletons pulse. No confetti, no long
transitions, nothing that costs a frame on a mid-range Android.

## Accessibility

- every text token clears WCAG AA, asserted in both themes
- minimum touch target 44dp
- state is never carried by colour alone — the unread notification has a border
  *and* a badge; an internal note has a dashed border *and* a label
- accessibility labels on every control; `accessibilityRole="progressbar"` with
  real values on goal bars
- visible focus rings in the admin for keyboard navigation

## The admin

The panel mirrors the same token values as CSS custom properties in
`apps/admin/src/app/globals.css`, including the dark-mode block. It does not
import `@dinamique/ui`, which is React Native only. `packages/ui` remains the
source of truth for the values; the admin's copy is a mirror, and the token
tests guard the originals.
