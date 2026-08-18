import type { ImageSourcePropType } from 'react-native';

/**
 * The official Dinamique logo.
 *
 * The logo is a supplied brand asset — it is never redrawn, re-typeset in a
 * font, or reproportioned. Until the real file is in the repository this stays
 * null and <BrandMark> renders a visible placeholder rather than a fake mark,
 * so a missing asset is obvious instead of silently wrong (§131).
 *
 * To activate it:
 *   1. save the supplied transparent PNG to `assets/brand/logo.png`
 *   2. replace the line below with:
 *        export const LOGO_SOURCE: ImageSourcePropType =
 *          require('../../../../assets/brand/logo.png');
 *   3. set LOGO_ASPECT_RATIO to the file's real width / height
 */
export const LOGO_SOURCE: ImageSourcePropType | null = null;

/** width ÷ height of the supplied file. Update it with the real asset. */
export const LOGO_ASPECT_RATIO = 3.4;
