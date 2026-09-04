/**
 * Easing.
 *
 * The design system's motion rules govern the interface, small, purposeful,
 * nothing that costs a frame on a mid-range Android. A recap is not the
 * interface: it is a fifteen-second film the driver chooses to watch and
 * chooses to send to a group chat, and it is allowed to be slow and showy in
 * ways a button is not. What it is not allowed to be is jerky, which is what
 * all of this is for.
 */

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Linear position of `value` between `from` and `to`, clamped to 0..1. */
export function progressBetween(value: number, from: number, to: number): number {
  if (to <= from) return value >= to ? 1 : 0;
  return clamp01((value - from) / (to - from));
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - clamp01(t)) ** 3;
}

export function easeInCubic(t: number): number {
  return clamp01(t) ** 3;
}

export function easeOutExpo(t: number): number {
  const x = clamp01(t);
  return x >= 1 ? 1 : 1 - 2 ** (-10 * x);
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
}

/** Overshoots slightly then settles, for a card that lands rather than slides. */
export function easeOutBack(t: number, overshoot = 1.4): number {
  const x = clamp01(t) - 1;
  const c = overshoot + 1;
  return 1 + c * x ** 3 + overshoot * x ** 2;
}

/** 0 → 1 → 0. A beat that swells and recedes without a seam at either end. */
export function pulse(t: number): number {
  return Math.sin(Math.PI * clamp01(t));
}

/** Smoothstep between two edges. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = progressBetween(value, edge0, edge1);
  return t * t * (3 - 2 * t);
}
