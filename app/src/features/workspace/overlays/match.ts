// Title matching for the palette and finders: whole-word starts beat
// substrings, then the first letters of words ("zm" for "Zettelkasten
// method"), then a word start with one letter wrong, missing, extra or
// swapped. Titles are lower-cased once per notes array, and matching
// scans strings without building a regular expression per note, so
// 10,000 titles take a few milliseconds per keystroke.

import type { NoteMeta } from "../../../lib/vault/types";
import { titleOf } from "../names";
import { openable } from "../tree";

const WORD_BREAK = " -_/:(";

/** `score` for text and query already lower-cased and trimmed; without
 * `fuzzy`, first letters and typos are not tried. */
export function scoreLower(t: string, q: string, fuzzy = true): number {
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  let at = t.indexOf(q);
  if (at >= 0) {
    for (; at >= 0; at = t.indexOf(q, at + 1)) if (at === 0 || WORD_BREAK.includes(t[at - 1]!)) return 60;
    return 40;
  }
  if (!q.includes(" ")) return fuzzy && initials(t, q) ? 30 : fuzzy && nearWordStart(t, q) ? 25 : 0;
  const words = q.split(/\s+/);
  return words.length > 1 && words.every((w) => t.includes(w)) ? 20 : 0;
}

/** Whether `q` is the first letters of some of `t`'s words, in order. */
function initials(t: string, q: string): boolean {
  if (q.length < 2) return false;
  let at = 0;
  for (let i = 0; i < t.length && at < q.length; i++) {
    if ((i === 0 || WORD_BREAK.includes(t[i - 1]!)) && t[i] === q[at]) at++;
  }
  return at === q.length;
}

/** Whether `a` becomes `b` with at most one letter changed, added, dropped
 * or two neighbours swapped. */
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length || i === b.length) return true;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** Whether a word of `t` starts with `q` give or take one typo. Short
 * queries match too much this way, so they are left out. */
function nearWordStart(t: string, q: string): boolean {
  if (q.length < 4) return false;
  for (let i = 0; i < t.length; i++) {
    if (i > 0 && !WORD_BREAK.includes(t[i - 1]!)) continue;
    for (const len of [q.length - 1, q.length, q.length + 1]) {
      if (i + len <= t.length && oneEdit(t.slice(i, i + len), q)) return true;
    }
  }
  return false;
}

/** Scores `text` for `query`: whole-word starts beat substrings. 0 is no match. */
export const score = (text: string, query: string) => scoreLower(text.toLowerCase(), query.trim().toLowerCase());

export interface Keyed {
  note: NoteMeta;
  /** The title as shown ("Untitled", a journal day's long date), lower-cased. */
  shown: string;
  /** The stored title, lower-cased. */
  title: string;
}

const keyCache = new WeakMap<readonly NoteMeta[], Keyed[]>();
const recentCache = new WeakMap<readonly NoteMeta[], NoteMeta[]>();

/** Openable notes with their lower-cased titles, computed once per list. */
export function searchKeys(notes: readonly NoteMeta[]): Keyed[] {
  let keys = keyCache.get(notes);
  if (!keys) {
    keys = openable(notes).map((note) => ({ note, shown: titleOf(note).toLowerCase(), title: note.title.toLowerCase() }));
    keyCache.set(notes, keys);
  }
  return keys;
}

/** Openable notes, last changed first, computed once per list. */
export function byModified(notes: readonly NoteMeta[]): NoteMeta[] {
  let sorted = recentCache.get(notes);
  if (!sorted) {
    sorted = [...openable(notes)].sort((a, b) => b.modified - a.modified);
    recentCache.set(notes, sorted);
  }
  return sorted;
}

/** The best `limit` notes for `query` by title, then by last change. */
export function matchTitles(notes: readonly NoteMeta[], query: string, limit: number): NoteMeta[] {
  const q = query.trim().toLowerCase();
  const found: { note: NoteMeta; s: number }[] = [];
  const keys = searchKeys(notes);
  for (const key of keys) {
    const s = scoreLower(key.shown, q, false) || scoreLower(key.title, q, false);
    if (s > 0) found.push({ note: key.note, s });
  }
  // First letters and typos only when plain matching finds too few, which
  // keeps a keystroke over 10,000 titles quick.
  if (found.length < limit) {
    const plain = new Set(found.map((f) => f.note));
    for (const key of keys) {
      if (plain.has(key.note)) continue;
      const s = scoreLower(key.shown, q) || scoreLower(key.title, q);
      if (s > 0) found.push({ note: key.note, s });
    }
  }
  found.sort((a, b) => b.s - a.s || b.note.modified - a.note.modified);
  return found.slice(0, limit).map((f) => f.note);
}
