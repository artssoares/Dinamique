# Brand assets

## `logo.png` and `logo-negativo.png`

The official Dinamique logo, extracted from the brand mini-manual V1.0. Two
files because the manual asks for both:

- `logo.png`, the blue wordmark with the coral dot, for light surfaces
- `logo-negativo.png`, the white wordmark with the coral dot, for the brand
  blue, headers and dark surfaces

`<BrandMark>` (`apps/mobile/src/features/brand/`) renders one or the other by
its `onDark` prop. The logo is never redrawn, re-typeset in a font, or
reproportioned; the coral dot is part of the signature and is never removed.

The shared story card carries `logo-negativo.png` too, but inlined as a data
URI in `packages/ui/src/story/wordmark.ts` — a generated file, with the command
to refresh it in its own header. That copy exists because the card is exported
to a PNG, and on the web that export serialises the SVG and reloads it as an
image: a bundled asset referenced by URL does not resolve inside the serialised
copy, so the mark would be missing from the file somebody posts. Regenerate it
whenever the brand file changes; nothing checks that the two agree.

## Brand colours

Taken from the logo and encoded in `packages/ui/src/tokens/palette.ts`:

| Role | Hex | RGB |
| --- | --- | --- |
| Blue 500 (primary) | `#0137F7` | 1, 55, 247 |
| Coral 500 (accent) | `#FF6A54` | 255, 106, 84 |
| White | `#FFFFFF` | 255, 255, 255 |

Both are the `500` step of a ten-step ramp; every other step is a tint or shade
of the same hue, never an independently chosen colour.
