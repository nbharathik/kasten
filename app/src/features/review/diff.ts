// Line diffs for the review queue and the history view: which lines an edit
// kept, removed and added (a longest common subsequence of lines), paired
// up for a side-by-side view and folded around the changes. Pure functions,
// so they are easy to test and cheap to run on every render.

import { alignSequences } from "../pages/markdown/align";

export type LineKind = "same" | "del" | "add";

export interface DiffLine {
  kind: LineKind;
  text: string;
  /** Line number in the old text, from 1 (kept and removed lines). */
  a?: number;
  /** Line number in the new text, from 1 (kept and added lines). */
  b?: number;
}

/** One side of a side-by-side row. */
export interface Cell {
  kind: LineKind;
  text: string;
  line: number;
}

/** A side-by-side row; an empty side means the other side has no partner. */
export interface Row {
  left: Cell | null;
  right: Cell | null;
}

/** A shown item, with its place in the full list. */
export interface Shown<T> {
  item: T;
  index: number;
}

/** A run of unchanged items folded away: `count` items from `start`. */
export interface Fold {
  fold: true;
  start: number;
  count: number;
}

export type Piece<T> = Shown<T> | Fold;

/** A text's lines without their line ends. A final line end adds no empty line. */
export function splitLines(text: string | null): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** The lines of `before` and `after`, kept, removed and added, in order.
 * Within a change, removals come before additions, as git shows them. */
export function diffLines(before: string | null, after: string | null): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const match = alignSequences(a, b, (x, y) => x === y);
  const out: DiffLine[] = [];
  let j = 0;
  a.forEach((text, i) => {
    const to = match[i]!;
    if (to < 0) {
      out.push({ kind: "del", text, a: i + 1 });
      return;
    }
    for (; j < to; j++) out.push({ kind: "add", text: b[j]!, b: j + 1 });
    out.push({ kind: "same", text, a: i + 1, b: j + 1 });
    j++;
  });
  for (; j < b.length; j++) out.push({ kind: "add", text: b[j]!, b: j + 1 });
  return out;
}

/** How many lines a diff adds and removes. */
export function countChanges(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "add") added++;
    else if (line.kind === "del") removed++;
  }
  return { added, removed };
}

const cell = (line: DiffLine, side: "a" | "b"): Cell => ({ kind: line.kind, text: line.text, line: line[side] ?? 0 });

/** Rows for a side-by-side view. Kept lines sit on both sides; each run of
 * removals is paired line by line with the additions after it, and the
 * longer side gets empty partners. */
export function pairRows(lines: readonly DiffLine[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.kind === "same") {
      rows.push({ left: cell(line, "a"), right: cell(line, "b") });
      i++;
      continue;
    }
    const removed: DiffLine[] = [];
    const added: DiffLine[] = [];
    while (i < lines.length && lines[i]!.kind === "del") removed.push(lines[i++]!);
    while (i < lines.length && lines[i]!.kind === "add") added.push(lines[i++]!);
    for (let k = 0; k < Math.max(removed.length, added.length); k++) {
      rows.push({ left: removed[k] ? cell(removed[k]!, "a") : null, right: added[k] ? cell(added[k]!, "b") : null });
    }
  }
  return rows;
}

/** Whether a side-by-side row shows a change. */
export const rowChanged = (row: Row): boolean => row.left?.kind !== "same";

/** For each line, the index of its partner: within a change the k-th
 * removal pairs with the k-th addition, as side by side. Null otherwise. */
export function partners(lines: readonly DiffLine[]): (number | null)[] {
  const out = new Array<number | null>(lines.length).fill(null);
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.kind === "same") {
      i++;
      continue;
    }
    const removed: number[] = [];
    const added: number[] = [];
    while (i < lines.length && lines[i]!.kind === "del") removed.push(i++);
    while (i < lines.length && lines[i]!.kind === "add") added.push(i++);
    for (let k = 0; k < Math.min(removed.length, added.length); k++) {
      out[removed[k]!] = added[k]!;
      out[added[k]!] = removed[k]!;
    }
  }
  return out;
}

/** Folding fewer lines than this saves no space, so they stay open. */
const MIN_FOLD = 3;

/** `items` with long runs of unchanged ones folded away, keeping `context`
 * items on each side of every change. With no changes, all of it folds. */
export function foldUnchanged<T>(items: readonly T[], changed: (item: T) => boolean, context = 3): Piece<T>[] {
  const keep = new Uint8Array(items.length);
  items.forEach((item, i) => {
    if (!changed(item)) return;
    const end = Math.min(items.length - 1, i + context);
    for (let k = Math.max(0, i - context); k <= end; k++) keep[k] = 1;
  });
  const out: Piece<T>[] = [];
  let i = 0;
  while (i < items.length) {
    if (keep[i]) {
      out.push({ item: items[i]!, index: i });
      i++;
      continue;
    }
    let j = i;
    while (j < items.length && !keep[j]) j++;
    if (j - i < MIN_FOLD) for (let k = i; k < j; k++) out.push({ item: items[k]!, index: k });
    else out.push({ fold: true, start: i, count: j - i });
    i = j;
  }
  return out;
}

const WORD = /[\p{L}\p{N}_]/u;
const isWord = (ch: string | undefined) => ch !== undefined && WORD.test(ch);
const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** Where two versions of a line differ: from `start` to `endA` in the old
 * one and to `endB` in the new one. The ends snap out to whole words so a
 * changed word lights up whole. Null when the lines share too little for a
 * highlight to help (under a quarter of the shorter line). */
export function changedSpan(a: string, b: string): { start: number; endA: number; endB: number } | null {
  if (a === b) return null;
  const shorter = Math.min(a.length, b.length);
  let start = 0;
  while (start < shorter && a[start] === b[start]) start++;
  let tail = 0;
  while (tail < shorter - start && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  // Never split a surrogate pair.
  if (start > 0 && isHigh(a.charCodeAt(start - 1))) start--;
  if (tail > 0 && isLow(a.charCodeAt(a.length - tail))) tail--;
  // Snap to word edges: a change inside a word marks the whole word.
  while (start > 0 && isWord(a[start - 1]) && (isWord(a[start]) || isWord(b[start]))) start--;
  while (tail > 0 && isWord(a[a.length - tail]) && (isWord(a[a.length - tail - 1]) || isWord(b[b.length - tail - 1]))) tail--;
  if (start + tail < Math.max(3, shorter / 4)) return null;
  return { start, endA: a.length - tail, endB: b.length - tail };
}
