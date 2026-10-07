// A line diff by longest common subsequence, for comparing a version of a
// note with its current text. Lines both ends share are matched first, so
// a small change to a long note stays cheap.

export type DiffKind = "same" | "added" | "removed";

export interface DiffLine {
  kind: DiffKind;
  text: string;
}

/** Past this many table cells the middle is shown as removed, then added. */
const MAX_CELLS = 4_000_000;

/** The lines of `text`; a final line break does not start another line. */
export function linesOf(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

const line = (kind: DiffKind) => (text: string): DiffLine => ({ kind, text });

/** How to get from `before` to `after`, line by line. */
export function lineDiff(before: string, after: string, maxCells = MAX_CELLS): DiffLine[] {
  const a = linesOf(before);
  const b = linesOf(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return [
    ...a.slice(0, start).map(line("same")),
    ...middle(a.slice(start, endA), b.slice(start, endB), maxCells),
    ...a.slice(endA).map(line("same")),
  ];
}

function middle(a: string[], b: string[], maxCells: number): DiffLine[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0 || (n + 1) * (m + 1) > maxCells) return [...a.map(line("removed")), ...b.map(line("added"))];
  // lcs[i * w + j]: the longest common subsequence of a[i..] and b[j..].
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] = a[i] === b[j] ? lcs[(i + 1) * w + j + 1]! + 1 : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i++]! });
      j++;
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
      // On a tie the removal comes first, as diffs usually read.
      out.push({ kind: "removed", text: a[i++]! });
    } else {
      out.push({ kind: "added", text: b[j++]! });
    }
  }
  while (i < n) out.push({ kind: "removed", text: a[i++]! });
  while (j < m) out.push({ kind: "added", text: b[j++]! });
  return out;
}

/** How many lines were added and removed. */
export function diffCounts(diff: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const d of diff) {
    if (d.kind === "added") added++;
    else if (d.kind === "removed") removed++;
  }
  return { added, removed };
}
