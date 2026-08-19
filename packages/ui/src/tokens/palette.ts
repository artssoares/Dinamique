/**
 * Paleta da marca Dinamique — mini manual de marca V1.0, agosto de 2026.
 *
 * As três âncoras são as do manual, sem arredondamento:
 *   Dinamique Blue   #065DF7   rgb(6, 93, 247)     marca, botões, destaques
 *   Coral Point      #FD6561   rgb(253, 101, 97)   acento, o ponto final
 *   Midnight Navy    #03093B   rgb(3, 9, 59)       texto, contraste, escuro
 *
 * Os demais passos são tons e sombras da mesma matiz, gerados por luminosidade
 * e nunca escolhidos à parte — é o que impede a interface de virar um template.
 * Os neutros descendem do Midnight Navy, então o branco encosta no azul da
 * marca sem puxar para cinza esverdeado.
 *
 * O manual é explícito sobre o coral: acento, nunca cor dominante, e fora de
 * texto pequeno. Por isso ele não tem passo de texto no tema claro.
 */

export const blue = {
  50: '#F0F5FF',
  100: '#DBE8FF',
  200: '#B4CFFE',
  300: '#79A9FC',
  /** Preenchimento da marca no escuro: texto branco em cima passa AA. */
  400: '#1A6CF9',
  /** Dinamique Blue — a cor do logotipo. */
  500: '#065DF7',
  600: '#0748CA',
  700: '#0836A0',
  800: '#082278',
  900: '#061356',
} as const;

export const coral = {
  50: '#FFF0F0',
  100: '#FFE1E0',
  200: '#FEC0BD',
  300: '#FD9996',
  400: '#FD817C',
  /** Coral Point — a cor do ponto final da assinatura. */
  500: '#FD6561',
  600: '#DF3F3A',
  700: '#B32F29',
  800: '#7B2824',
  900: '#4B1D1B',
} as const;

/**
 * Neutrals carry a faint blue cast so white surfaces sit next to the brand
 * blue without looking grey-green. Dark mode is built from the 800–950 steps —
 * never pure black (§17).
 */
export const neutral = {
  0: '#FFFFFF',
  25: '#FBFCFD',
  50: '#F6F7FB',
  100: '#EEEFF6',
  200: '#DCDDEA',
  300: '#C1C3D7',
  400: '#A0A2BB',
  500: '#7B7E9D',
  600: '#545883',
  700: '#393E6A',
  800: '#222753',
  850: '#141948',
  900: '#0B1141',
  /** Midnight Navy — o fundo mais escuro. Nunca preto absoluto. */
  950: '#03093B',
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
