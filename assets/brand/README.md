# Brand assets

## `logo.png` — required, not yet supplied

The official Dinamique logo (transparent PNG) belongs here as `logo.png`.

It was not included in the repository, so `<BrandMark>` currently renders a
dashed placeholder. That is deliberate: the logo is never redrawn, re-typeset
in a font, or reproportioned, and a wrong mark shipped quietly would be worse
than a visible gap.

To activate it:

1. save the supplied transparent PNG as `assets/brand/logo.png`
2. in `apps/mobile/src/features/brand/logo.ts`, replace the `null` export with
   `require('../../../../assets/brand/logo.png')`
3. set `LOGO_ASPECT_RATIO` to the file's real width ÷ height

The admin panel reads the same file from `apps/admin/public/logo.png`.

The shared story card does **not** follow this rule, on purpose: it typesets
`DINAMIQUE` and says nothing. Inside the app a missing asset should be loud,
so somebody notices before release; on an image a driver is about to post, a
dashed placeholder would be the one thing everyone sees.

## Brand colours

Taken from the logo and encoded in `packages/ui/src/tokens/palette.ts`:

| Role | Hex | RGB |
| --- | --- | --- |
| Blue 500 (primary) | `#0137F7` | 1, 55, 247 |
| Coral 500 (accent) | `#FF6A54` | 255, 106, 84 |
| White | `#FFFFFF` | 255, 255, 255 |

Both are the `500` step of a ten-step ramp; every other step is a tint or shade
of the same hue, never an independently chosen colour.
