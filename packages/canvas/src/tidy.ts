// Floating-point dust: 250.9 - 93.3 + 93.3 is 250.90000000000003. A box that has snapped onto a line at
// 250.9 should be saved at 250.9, next to the item that line belongs to, not a hair off it.

const PER_UNIT = 1e9;

/**
 * `n` rounded to a billionth of a unit: far below anything a person can see or a
 * document needs, and far above the error left by adding a few numbers. -0
 * becomes 0. Values too large for that to be safe are left as they are.
 */
export function tidy(n: number): number {
  return Math.abs(n) < 1e6 ? Math.round(n * PER_UNIT) / PER_UNIT + 0 : n;
}
