// What a list shows in front of its items: the bullet glyph or the number,
// and which number an item has.

import type { Paragraph } from "@kasten-slides/wasm";

import { BULLETS } from "./metrics.ts";

/** The deepest list level: PowerPoint and Google Slides offer nine. */
export const MAX_LEVEL = 8;

/** The level of a paragraph as a whole number from 0. */
export function levelOf(paragraph: Pick<Paragraph, "level">): number {
  const level = paragraph.level;
  return typeof level === "number" && Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
}

/** `1` is `a`, `26` is `z`, `27` is `aa`, as a spreadsheet counts its columns. */
function letters(n: number): string {
  let rest = n;
  let out = "";
  while (rest > 0) {
    rest -= 1;
    out = String.fromCharCode(97 + (rest % 26)) + out;
    rest = Math.floor(rest / 26);
  }
  return out;
}

const ROMAN: readonly (readonly [number, string])[] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

/** Lower-case Roman numerals up to 3999; beyond that the plain number. */
function roman(n: number): string {
  if (n >= 4000) return String(n);
  let rest = n;
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

/**
 * The marker in front of a list item: a bullet from `BULLETS` by level, or a
 * number. Numbers cycle through three forms by level, `1.` `2.`, then `a.` `b.`,
 * then `i.` `ii.`, and start the cycle again. `indexInRun` is the item's
 * number, counting from 1, as `listNumbers` gives it. A paragraph that is not
 * a list item has no marker.
 */
export function markerFor(paragraph: Paragraph, indexInRun: number): string {
  const level = levelOf(paragraph);
  if (paragraph.list === "bullet") return BULLETS[level % BULLETS.length] ?? BULLETS[0];
  if (paragraph.list !== "number") return "";
  const n = Number.isFinite(indexInRun) ? Math.max(1, Math.floor(indexInRun)) : 1;
  switch (level % 3) {
    case 1:
      return `${letters(n)}.`;
    case 2:
      return `${roman(n)}.`;
    default:
      return `${n}.`;
  }
}

/** The bits of a paragraph that decide its number. */
type Listed = Pick<Paragraph, "list" | "level">;

/**
 * The number each numbered paragraph shows, and null for the rest. An item's
 * number counts the run of numbered paragraphs at its own level: items
 * nested deeper in between do not interrupt it, while a plain paragraph, a
 * bullet at the same level or an item at a shallower level start it again.
 */
export function listNumbers(paragraphs: readonly Listed[]): (number | null)[] {
  const counters: number[] = [];
  return paragraphs.map((paragraph) => {
    if (paragraph.list !== "number" && paragraph.list !== "bullet") {
      counters.length = 0;
      return null;
    }
    const level = levelOf(paragraph);
    counters.length = Math.min(counters.length, level + 1);
    if (paragraph.list === "bullet") {
      counters[level] = 0;
      return null;
    }
    const next = (counters[level] ?? 0) + 1;
    counters[level] = next;
    return next;
  });
}
