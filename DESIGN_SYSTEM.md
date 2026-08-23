# Design system

## Brand colours

Taken from the logo. Both are the **500** step of a ten-step ramp; every other
step is a tint or shade of the same hue, never an independently chosen colour.

| Role | Hex | RGB |
| --- | --- | --- |
| Blue 500 – primary | `#0137F7` | 1, 55, 247 |
| Coral 500 – accent | `#FF6A54` | 255, 106, 84 |
| White | `#FFFFFF` | 255, 255, 255 |

Neutrals carry a faint blue cast so white surfaces sit next to the brand blue
without reading grey-green.

## How colour is used

| Colour | For |
| --- | --- |
| Blue | identity, active navigation, primary actions, progress, focus |
| Coral | highlights, badges, small points of attention, microinteractions |
| Green | **profit, success, completed – meaning only** |
| Red | **expense, error, important alert – meaning only** |
| Amber | warnings |

Green is never the interface's primary colour. White dominates; blue and coral
are used with intent. A screen that is entirely blue or entirely coral is
wrong.

## Fill versus text

`success`, `danger` and `warning` are **fill** colours – bars, dots, badges.
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
heroFrom  heroTo    heroBackFrom  heroBackTo    heroDeepFrom  heroDeepTo
textOnHeroBack
success  successSubtle  successText
danger   dangerSubtle   dangerText
warning  warningSubtle  warningText
overlay  overlayStrong  skeleton       focusRing
```

Both themes define every key – asserted by test, so a token cannot exist in one
theme and be missing from the other.

### The three "loud surface" families

`surfaceInverse` **inverts**: it is near-black in light mode and near-white in
dark, so a component keeps its "this one shouts" role in both. The segmented
control's selected pill uses it.

`navSurface` does **not** invert. The tab bar stays dark in both themes, because
a white bar glowing at the bottom of a dark screen is glare in a car at night –
which is precisely when the app is open. `navSurfaceActive` is the light pill on
it, and the token test asserts both pairs clear AA.

`heroFrom`/`heroTo`, `heroBackFrom`/`heroBackTo` and `heroDeepFrom`/`heroDeepTo`
are the three gradients of the Home card deck, addressed by `HeroDeck` as the
tones `brand`, `warm` and `deep` rather than by colour. Every stop is asserted
against the type it actually carries: white on `brand` and `deep`, and
`textOnHeroBack` – near-black – on `warm`, which is the only reason `warm` gets
to be that vivid an orange. White measures 2.4:1 there and cannot carry a label.

A fourth tone means a fourth token pair and a fourth contrast assertion. There
is no generic "hero gradient" to reach for.

## Contrast, and what changed

The muted grey was Neutral 400, which measures 2.86:1 on white: legible on a
desk, invisible on a phone at arm's length in daylight. It is now Neutral 500,
and `borderPrimary` moved from Neutral 200 to 300 for the same reason. Both
floors are asserted:

- every text token clears AA on its background – as before
- `textMuted` clears the large-text floor (3:1), in both themes
- borders clear 1.35:1 against the surface they divide
- `textOnInverse`, `navText`, `navTextActive` and both hero gradients are
  asserted too, because navigation going unreadable is not a cosmetic failure

## Dark mode

Built from the 850–950 neutrals, never absolute black. Brand steps lift (Blue
400, Coral 400) so they stay legible without glowing. Subtle backgrounds become
low-alpha overlays rather than solid tints.

### Choosing it once, not three times

The theme has to be right on the first frame, and on the web that frame belongs
to the browser rather than to React. Three things make that true:

1. **The device remembers.** `features/theme/preference.ts` stores the choice
   locally and reads it synchronously on the web, so the app opens in it.
   `useThemeBoot` then adopts the profile's preference once per person, and
   anything chosen afterwards wins outright.
2. **The document is painted before the bundle loads.** `app/+html.tsx`
   interpolates `backgroundPrimary` from these very tokens into two CSS rules –
   one on `prefers-color-scheme`, one on the stored choice – so the page can
   never start white and turn dark.
3. **The pre-rendered markup stays hidden until the app has painted.** The web
   export renders every screen in Node, where there is no operating system
   preference and no stored one, so the HTML in the file is always the light
   theme. `#root` starts at `opacity: 0` and the app reveals it on mount, with
   a four second failsafe in the inline script in case the bundle never runs.

Together they replace what the app used to do, which was to open on the system
default, switch when the profile arrived, and switch back when it reloaded.

## Scales

**Spacing** is a 4pt grid: 2, 4, 8, 12, 16, 20, 24, 32, 40, 56, 72.

**Radius**: 8, 12, 16, 20, 24, 32, and `pill` (999). Generous, but only chips,
round buttons and the tab bar are fully pill-shaped.

**Breakpoints** – `compact` 360, `regular` 400, `medium` 600, `expanded` 900.
Read through `useResponsive()`, never by comparing a raw width. The hook also
defends against a window that reports itself as zero, which is what the web
does until something resizes it: the static export renders in Node, where
there is no window at all, and the subscription that would correct it only
fires on a resize event that may never come. Anything that multiplied by that
width produced zero in silence – it is why the floating tab bar opened 18
pixels wide with its five controls spilling out of it, and stayed that way
until the phone was rotated. Above `medium`
content stops stretching and centres inside `layout.maxContentWidth` (560), so
a tablet or a browser window shows a readable column instead of one card three
feet wide. `layout` also carries the tab bar's height, which is how screens
know how much room to leave under themselves.

**Type** – financial figures get their own oversized steps, because the number
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
count-up. Nothing longer – asserted by test.

## Icons

A 24×24 stroke set (`Icon`, `IconName`) drawn on one grid: 1.8 stroke, round
caps, fills only where a shape must read solid at 16dp. It replaces the unicode
glyphs the app used to draw for navigation and chevrons (`◎ ▤ ◈ ⋯ ›`), which
rendered at a different weight, size and baseline on every device – the single
biggest reason the interface looked homemade. Icons take their colour from the
`color` prop, defaulting to the current text colour; an icon never needs a hex.

## Components

**Layout** – `Screen` · `ScreenHeader` · `SectionHeader` · `Divider` · `Sheet`

**Content** – `Text` · `Card` · `HeroDeck` · `Gradient` · `Money` · `Metric` /
`CurrencyMetric` · `StatTile` · `GoalProgress` · `ProgressRing` · `EmptyState` ·
`InsightCard` · `ListRow` · `Notice` · `Skeleton` · `Avatar` · `Badge` /
`CountBadge` · `Reveal`

**Controls** – `Button` · `IconButton` · `Chip` · `SegmentedControl` ·
`OptionCard` · `Field` · `AmountInput` · `Select` · `StepProgress` · `Stepper`

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
  set on a header that never rendered – which is why Metas, Perfil, Plano and
  the cost screens had no way back except a swipe.
- **`Button`** centres itself when it is not `fullWidth`. It used to sit hard
  against the left edge of whatever contained it, which reads as an
  afterthought; the middle is where the eye already is after reading the text
  above it. `align` overrides it in the rare case that a button really does
  belong in a corner.
- **`Stepper`** counts units. Typing "3" is four actions – focus, open the
  pad, press, dismiss – and counting is one, which is the one that works at a
  traffic light. Used wherever the app asks how many of something.
- **`Notice`** is the band that says what went wrong, in place, beside the
  control that failed. Writes used to fail in silence, which is how "eu clico e
  nada acontece" happens. An alert interrupts; this stays on the screen the
  person is already looking at, and carries the server's own words as a small
  technical line for support to read back.
- **`OptionCard`** exists because onboarding used chips, which is a lot of
  precision to ask of someone answering questions one-handed in a parked car.
  Selection is carried by a border, a tint *and* a check mark.
- **`Gradient`** draws its fill with `react-native-svg` rather than a native
  gradient module, so it adds no dependency and behaves the same on iOS,
  Android and web. Each instance generates its own gradient id – on the web all
  SVG defs share one document, and a fixed id makes the second card on a screen
  paint with the first card's colours.

## The route trace

The replay and the shared card draw the same shape through the same
projection (`packages/ui/src/route/geometry.ts`): equirectangular, anchored on
the track's own middle latitude. One scale for both axes, so the leftover space
becomes centring rather than stretch — a route squeezed to fill its box is a
different route, and a straight run up an avenue would come out as a diagonal.

The path length is computed from the segments rather than read from the
rendered node. For a polyline the sum of the segments *is* the length, and
computing it removes a ref, a layout-timing dependency and a platform
difference at once.

The line is revealed with `strokeDasharray`/`strokeDashoffset` driven by an
`Animated.Value`, the same mechanism as `ProgressRing` — and linear, never
eased: easing a route makes it look like the driver sped up and slowed down
where they did not.

## The story card

1080×1920, because that is what a story is. Fixed brand colours rather than the
theme: the image leaves the phone and should look the same to whoever opens it.

Entirely SVG, with no map tile in it, and exported through
`react-native-svg`'s own `toDataURL` — the same library every icon in the app
already goes through, so the share path adds no native module.

Inside the app a missing asset should be loud: `<BrandMark>` draws its dashed
box precisely so nobody ships without noticing. On the card the wordmark is
typeset silently. That asymmetry is deliberate — an image somebody is about to
post is the last place for a placeholder.

## Navigation

The tab bar is a floating pill that clears the bottom edge, not a strip pinned
to it. Only the active destination carries its label, and the pill animates its
width, which is what lets five destinations fit without crowding. The centre
action keeps its brand fill in every state – it is what the app is for – so
"you are here" is said with a ring instead of a colour change.

The header is fixed and deliberate: a menu control on the left, the bell and
the user's own photo on the right. The photo is the largest, right-most element
because "that is me, and this is my account" is the one thing a header has to
communicate without a label.

## The tour

Coach marks, not a card in the corner. The screen dims, the control the step
talks about stays lit inside a cut-out – a real hole punched with an even-odd
SVG fill, not a lighter patch – and the text sits against it, flipping above
the highlight when there is no room below. Each step moves the cut-out, so
people learn *where* things are rather than only that they exist.

Placement is measured, never assumed, and lives in `tour/placement.ts` with
tests. The first version compared the space below the highlight against a
guess at the card's height; a longer description or a shorter screen was
enough to push the card, and with it "Pular" and "Próximo", off the bottom of
the screen. The scrim swallows every tap, so that left no way out but a
reload. Now the card reports its own height, the result is clamped into the
safe area whichever branch produced it, long copy scrolls inside the card
instead of growing it, and "Pular o tour" is present on every step.

Copy lives in `tour_steps` and is editable by the admin. The anchor cannot: an
admin can write new text but cannot invent a control, so slugs map to UI keys
in the app (`TARGET_BY_SLUG`). A step with no mapped or mounted target still
shows, centred and without a cut-out, rather than pointing at nothing.

## Motion principles

Small and purposeful: numbers count up, progress bars grow, screens and their
sections arrive staggered, the segmented control's thumb slides, controls
spring under a finger, skeletons pulse. No confetti, no long transitions,
nothing that costs a frame on a mid-range Android.

Two rules keep it from feeling stiff:

- **Springs, not cuts, for anything a finger causes.** `usePressMotion` is the
  one implementation, shared by `Button`, `IconButton`, `Card`, `Chip` and
  `OptionCard`. A `({ pressed }) => …` style is a state change: the control
  jumps down on touch and jumps back on release, and two jumps in a row is
  what reads as stiff.
- **Frames, not timers, for anything that runs over time.** The currency
  count-up is driven by `requestAnimationFrame` and reads the real elapsed
  time, so a dropped frame costs nothing and a backgrounded tab stops the work
  entirely. On a 16ms timer the callbacks queued behind themselves and the
  figure stuttered.

Every animation checks `useReducedMotion` and falls back to an instant change.

## Accessibility

- every text token clears WCAG AA, asserted in both themes
- muted text, borders, the tab bar and both hero gradients are asserted too
- minimum touch target 44dp – `IconButton` adds hit slop when drawn smaller
- state is never carried by colour alone – the unread notification has a border
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
