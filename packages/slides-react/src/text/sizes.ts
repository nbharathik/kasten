// The sizes the "bigger" and "smaller" buttons step through, in points.

export const SIZE_STEPS: readonly number[] = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 44, 54, 72, 96];

const EPSILON = 1e-6;

/**
 * The size `steps` entries of the list up (positive) or down (negative) from
 * `current`, which need not be on the list: from 22 one step up is 24 and one
 * step down is 20. At either end of the list, or beyond it, the size stays
 * where it is.
 */
export function nextSize(current: number, steps: number): number {
  let size = current;
  for (let n = Math.abs(Math.trunc(steps)); n > 0; n--) {
    const next = steps > 0 ? SIZE_STEPS.find((entry) => entry > size + EPSILON) : [...SIZE_STEPS].reverse().find((entry) => entry < size - EPSILON);
    if (next === undefined) break;
    size = next;
  }
  return size;
}
