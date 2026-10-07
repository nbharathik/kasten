// A line-based three-way merge, as kasten-core's merge.rs: the preview keeps
// both sides' edits when they touch different lines.

const lines = (text: string) => text.split(/(?<=\n)/).filter((l) => l !== "");

/** Largest file the merge attempts, in lines per side. */
const MAX_LINES = 4000;

/** For each line of `base`, the index of the line of `other` it matches in a longest common subsequence. */
function matches(base: string[], other: string[]): (number | null)[] {
  const n = base.length;
  const m = other.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[at(i, j)] = base[i] === other[j] ? table[at(i + 1, j + 1)]! + 1 : Math.max(table[at(i + 1, j)]!, table[at(i, j + 1)]!);
    }
  }
  const out: (number | null)[] = new Array<number | null>(n).fill(null);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (base[i] === other[j]) out[i++] = j++;
    else if (table[at(i + 1, j)]! >= table[at(i, j + 1)]!) i++;
    else j++;
  }
  return out;
}

const same = (a: string[], b: string[]) => a.length === b.length && a.every((line, i) => line === b[i]);

/** The edits `ours` and `theirs` made to `base`, merged; null when they changed the same lines differently. */
export function merge3(base: string, ours: string, theirs: string): string | null {
  if (ours === theirs || theirs === base) return ours;
  if (ours === base) return theirs;
  const [o, a, b] = [lines(base), lines(ours), lines(theirs)];
  if (Math.max(o.length, a.length, b.length) > MAX_LINES) return null;
  const [ma, mb] = [matches(o, a), matches(o, b)];
  let out = "";
  let [i, ia, ib] = [0, 0, 0];
  for (;;) {
    let k = i;
    while (k < o.length && (ma[k] === null || mb[k] === null)) k++;
    const [ka, kb] = k < o.length ? [ma[k]!, mb[k]!] : [a.length, b.length];
    if (k === i && ka === ia && kb === ib) {
      if (k === o.length) break;
      out += o[k];
      [i, ia, ib] = [k + 1, ka + 1, kb + 1];
      continue;
    }
    const [basePart, ourPart, theirPart] = [o.slice(i, k), a.slice(ia, ka), b.slice(ib, kb)];
    if (same(ourPart, basePart)) out += theirPart.join("");
    else if (same(theirPart, basePart) || same(ourPart, theirPart)) out += ourPart.join("");
    else return null;
    [i, ia, ib] = [k, ka, kb];
  }
  return out;
}
