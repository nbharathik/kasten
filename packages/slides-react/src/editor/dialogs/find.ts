// Finding words in a deck: every place a phrase occurs, in reading order.
//
// This mirrors what the engine's `replace_all` operation does, so "3 of 12"
// and "Replaced 12" agree: it looks at each run of words on its own (a phrase
// split across differently formatted words is not found), leaves matches
// from overlapping, and lets only ASCII letters match in either case.

import type { Deck, Element, Text } from "@kasten-slides/wasm";

export interface FindOptions {
  /** Off by default. Letters beyond ASCII match only in the same case, whatever this says. */
  caseSensitive?: boolean;
  /** Match only whole words. */
  wholeWord?: boolean;
  /** Also look in the speaker notes; on by default. */
  includeNotes?: boolean;
}

/** Which words an element's match is in, for putting a replacement back in the same place. */
export interface FindSpot {
  /** The element that holds the words: a group's child, not the group. */
  id: string;
  /** The text of a text box or a shape, the label of a connector, or a cell of a table. */
  part: "text" | "label" | "cell";
  /** For a cell: its row, and its place in that row's cells. */
  row?: number;
  cell?: number;
  paragraph: number;
  run: number;
}

export interface FindMatch {
  /** The slide it is on. */
  slide: string;
  /** The element on the slide that holds it (a group, for words in a group's child); absent for the notes. */
  element?: string;
  /** In the speaker notes. */
  notes?: boolean;
  /** Where it starts: in its run for an element, in the whole notes for the notes. */
  index: number;
  /** How long it is (the length of the phrase looked for). */
  length: number;
  /** Where the words are, for an element. */
  spot?: FindSpot;
  /** Its place in the deck as numbers, so matches can be ordered and one told from another. */
  at: number[];
}

/** Notes come after everything on their slide. */
const AFTER_ELEMENTS = Number.MAX_SAFE_INTEGER;

const foldAscii = (text: string): string => text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());

const WORD = /[\p{Alphabetic}\p{N}]/u;

/** Whether the text from `start` to `end` stands alone: no letter or digit right before or after it. */
function standsAlone(text: string, start: number, end: number): boolean {
  const before = Array.from(text.slice(Math.max(0, start - 2), start)).pop();
  const after = Array.from(text.slice(end, end + 2))[0];
  return !(before !== undefined && WORD.test(before)) && !(after !== undefined && WORD.test(after));
}

/** Where `query` starts in `text`, left to right, without overlapping. */
export function occurrences(text: string, query: string, options: FindOptions = {}): number[] {
  if (query === "") return [];
  const hay = options.caseSensitive ? text : foldAscii(text);
  const needle = options.caseSensitive ? query : foldAscii(query);
  const found: number[] = [];
  let from = 0;
  while (from <= hay.length - needle.length) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    if (!options.wholeWord || standsAlone(text, at, at + needle.length)) {
      found.push(at);
      from = at + needle.length;
    } else {
      from = at + 1;
    }
  }
  return found;
}

interface Scan {
  slide: string;
  top: string;
  query: string;
  options: FindOptions;
  out: FindMatch[];
}

function inText(scan: Scan, text: Text, at: number[], spot: Omit<FindSpot, "paragraph" | "run">): void {
  text.paragraphs.forEach((paragraph, p) =>
    paragraph.runs.forEach((run, r) => {
      for (const index of occurrences(run.t, scan.query, scan.options)) {
        scan.out.push({ slide: scan.slide, element: scan.top, index, length: scan.query.length, spot: { ...spot, paragraph: p, run: r }, at: [...at, p, r, index] });
      }
    }),
  );
}

function inElement(scan: Scan, element: Element, at: number[]): void {
  if (element.type === "text") inText(scan, element.text, at, { id: element.id, part: "text" });
  else if (element.type === "shape" && element.text) inText(scan, element.text, at, { id: element.id, part: "text" });
  else if (element.type === "connector" && element.label) inText(scan, element.label, at, { id: element.id, part: "label" });
  else if (element.type === "table") {
    element.rows.forEach((row, r) => row.cells.forEach((cell, c) => inText(scan, cell.text, [...at, r, c], { id: element.id, part: "cell", row: r, cell: c })));
  } else if (element.type === "group") {
    element.children.forEach((child, i) => inElement(scan, child, [...at, i]));
  }
}

/**
 * Every match of `query` in the deck, slide by slide: the words in each
 * element in the order they are stacked (a group's children where the group
 * is), then the slide's notes.
 */
export function findAll(deck: Deck, query: string, options: FindOptions = {}): FindMatch[] {
  const out: FindMatch[] = [];
  if (query === "") return out;
  deck.slides.forEach((slide, s) => {
    slide.elements.forEach((element, e) => inElement({ slide: slide.id, top: element.id, query, options, out }, element, [s, e]));
    if (options.includeNotes ?? true) {
      for (const index of occurrences(slide.notes ?? "", query, options)) out.push({ slide: slide.id, notes: true, index, length: query.length, at: [s, AFTER_ELEMENTS, index] });
    }
  });
  return out;
}

/** Which of two places comes first: negative, zero or positive as `a` is before, at or after `b`. */
export function compareAt(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const difference = (a[i] as number) - (b[i] as number);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

/** Whether two matches are the same place in the deck. */
export const sameMatch = (a: FindMatch | null | undefined, b: FindMatch | null | undefined): boolean => Boolean(a && b && a.slide === b.slide && compareAt(a.at, b.at) === 0);
