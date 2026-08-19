/**
 * Dinamique brand palette.
 *
 * Two brand families only – Blue (primary) and Coral (accent) – plus a neutral
 * ramp and two semantic colours. Green means profit/success and red means
 * expense/error; neither is ever used decoratively (§13).
 *
 * The 500 step of each family is the brand colour taken from the logo:
 *   Blue  500  #0137F7   rgb(1, 55, 247)
 *   Coral 500  #FF6A54   rgb(255, 106, 84)
 *
 * The remaining steps are tints/shades of those anchors, not independently
 * chosen hues, which is what keeps the UI from looking like a template (§138).
 */

export const blue = {
  50: '#EFF3FF',
  100: '#DBE4FF',
  200: '#B8C9FF',
  300: '#8AA5FF',
  400: '#4A71FF',
  500: '#0137F7',
  600: '#012CC6',
  700: '#02249C',
  800: '#031C78',
  900: '#04154F',
} as const;

export const coral = {
  50: '#FFF3F1',
  100: '#FFE3DE',
  200: '#FFC7BD',
  300: '#FFA394',
  400: '#FF866F',
  500: '#FF6A54',
  600: '#E5482F',
  700: '#BC3520',
  800: '#8F2717',
  900: '#5E1A0F',
} as const;

/**
 * Neutrals carry a faint blue cast so white surfaces sit next to the brand
 * blue without looking grey-green. Dark mode is built from the 800–950 steps –
 * never pure black (§17).
 */
export const neutral = {
  0: '#FFFFFF',
  25: '#FCFCFD',
  50: '#F7F8FA',
  100: '#F0F2F6',
  200: '#E3E6ED',
  300: '#CDD2DD',
  400: '#9AA1B1',
  500: '#6E7686',
  600: '#525A69',
  700: '#3B424F',
  800: '#252B36',
  850: '#1B202A',
  900: '#141821',
  950: '#0D1016',
} as const;

export const green = {
  50: '#E8F8EF',
  100: '#C6EFD8',
  400: '#34C77B',
  500: '#12A757',
  600: '#0A7A3F',
  900: '#073D21',
} as const;

export const red = {
  50: '#FDECEC',
  100: '#FBD3D3',
  400: '#F2626B',
  500: '#DC2B37',
  600: '#B01D28',
  900: '#5A0E14',
} as const;

export const amber = {
  50: '#FFF6E5',
  100: '#FFE8BF',
  400: '#FFB020',
  500: '#E08700',
  600: '#B36A00',
  700: '#8A5100',
  900: '#5C3600',
} as const;

export const palette = { blue, coral, neutral, green, red, amber } as const;
