// Aligns the top-level nodes an editor was loaded with against the nodes it
// holds now, so unchanged blocks can be written back byte for byte.

const MAX_TABLE_CELLS = 4_000_000;

/**
 * For each item in `before`, the index of the matching item in `after`, or -1.
 * Matches preserve order (a longest common subsequence). Common prefixes and
 * suffixes are matched first, so the quadratic part only covers the region
 * that actually changed.
 */
export function alignSequences<T>(before: readonly T[], after: readonly T[], eq: (a: T, b: T) => boolean): number[] {
  const match = new Array<number>(before.length).fill(-1);

  let start = 0;
  while (start < before.length && start < after.length && eq(before[start]!, after[start]!)) {
    match[start] = start;
    start++;
  }
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && eq(before[endBefore - 1]!, after[endAfter - 1]!)) {
    endBefore--;
    endAfter--;
    match[endBefore] = endAfter;
  }

  const n = endBefore - start;
  const m = endAfter - start;
  // Past this size the table costs too much memory. Treating the middle as
  // entirely changed only means those blocks are re-serialized, never lost.
  if (n === 0 || m === 0 || n * m > MAX_TABLE_CELLS) return match;

  // Classic LCS table over the changed middle.
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] = eq(before[start + i]!, after[start + j]!)
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(before[start + i]!, after[start + j]!) && table[i * width + j] === table[(i + 1) * width + j + 1]! + 1) {
      match[start + i] = start + j;
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  return match;
}
