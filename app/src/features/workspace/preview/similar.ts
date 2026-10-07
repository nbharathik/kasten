// Similar notes for the browser preview: the core's related notes
// (kasten-core, index/related.rs) worked out on the notes in memory. A
// note's most used words are weighed by how few notes use them, and other
// notes score the words they share.

import type { RelatedNote } from "../../../lib/vault/types";

/** Words too common to tell notes apart (the core's list). */
const STOP = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "any", "can", "had", "her", "was", "one", "our",
  "out", "get", "has", "him", "his", "how", "new", "now", "see", "two", "way", "who", "did", "its", "let",
  "put", "say", "she", "too", "use", "that", "with", "have", "this", "will", "your", "from", "they", "know",
  "want", "been", "good", "much", "some", "time", "very", "when", "come", "here", "just", "like", "make",
  "many", "more", "only", "over", "such", "take", "than", "them", "well", "were", "what", "then", "there",
  "their", "which", "would", "about", "could", "other", "these", "into", "also", "each", "does", "every",
  "where", "while", "after", "again", "being", "those", "should", "because", "before", "through", "still",
  "might", "must", "same", "most", "per", "back", "via", "etc", "yet", "may", "own", "off", "why", "yes",
  "even", "ever", "able", "though", "onto", "upon", "don", "doesn", "didn", "isn", "wasn", "aren", "won",
  "haven", "couldn", "wouldn", "shouldn",
]);

/** Most words weighed, notes looked at closely, and a usual note's length. */
const CANDIDATES = 32;
const SHORTLIST = 40;
const USUAL_WORDS = 300;
/** Telling words two notes must share to be similar. */
const MIN_SHARED = 2;

export interface SimilarDoc {
  path: string;
  title: string;
  icon: string | null;
  kind: string;
  body: string;
  /** Lower-cased titles it links to. */
  links: Set<string>;
}

/** Each word of three letters or more, accents off, and how often it comes. */
export function wordCounts(text: string, weight = 1, into = new Map<string, number>()): Map<string, number> {
  const folded = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  for (const word of folded.split(/[^\p{L}\p{N}]+/u)) {
    if ([...word].length < 3 || /^\d+$/.test(word) || STOP.has(word)) continue;
    into.set(word, (into.get(word) ?? 0) + weight);
  }
  return into;
}

const wordsOf = (d: SimilarDoc) => wordCounts(d.title, 1, wordCounts(d.body));

/** Up to `limit` notes about what the note at `path` is about, the most alike first. */
export function similarNotes(docs: SimilarDoc[], path: string, limit: number): RelatedNote[] {
  const self = docs.find((d) => d.path === path);
  if (!self) throw new Error(`No note at ${path}`);
  if (limit <= 0) return [];
  const counts = wordCounts(self.title, 3, wordCounts(self.body));
  const candidates = [...counts]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, CANDIDATES);
  const vocab = docs.map(wordsOf);
  const common = Math.max(Math.floor(docs.length / 20), 25);
  const terms: { word: string; weight: number; notes: Set<number> }[] = [];
  const scores = new Map<number, number>();
  const at = docs.indexOf(self);
  for (const [word, uses] of candidates) {
    const notes = new Set<number>();
    vocab.forEach((v, i) => v.has(word) && notes.add(i));
    if (notes.size < 2 || notes.size > common) continue;
    const weight = (1 + Math.log(uses)) * Math.log(docs.length / notes.size);
    if (weight <= 0) continue;
    for (const i of notes) if (i !== at) scores.set(i, (scores.get(i) ?? 0) + weight);
    terms.push({ word, weight, notes });
  }
  terms.sort((a, b) => b.weight - a.weight);
  const key = self.title.toLowerCase();
  return [...scores]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, Math.max(SHORTLIST, limit * 4))
    .filter(([i]) => docs[i]!.kind !== "template")
    // One word in common is chance, not a subject.
    .filter(([i]) => terms.filter((t) => t.notes.has(i)).length >= MIN_SHARED)
    .map(([i, score]) => {
      const other = docs[i]!;
      const length = other.body.split(/\s+/).filter(Boolean).length;
      const note: RelatedNote = {
        path: other.path,
        title: other.title,
        icon: other.icon,
        shared: terms.filter((t) => t.notes.has(i)).slice(0, 3).map((t) => t.word),
        linked: self.links.has(other.title.toLowerCase()) || other.links.has(key),
      };
      return { note, score: score / Math.sqrt(Math.max(1, length / USUAL_WORDS)) };
    })
    .sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title))
    .slice(0, limit)
    .map((r) => r.note);
}
