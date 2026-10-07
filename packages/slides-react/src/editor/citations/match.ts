// Finding a work in a bibliography by what a person remembers of it: its key, an author, a word of the title, the year.

import type { Reference } from "@kasten-slides/wasm";

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** Everything a work can be looked for by, in lower case. */
function haystack(work: Reference): string {
  return [work.key, work.title, ...work.authors, work.year, work.venue, work.eprint, work.doi].filter(Boolean).join(" ").toLowerCase();
}

/**
 * The works that hold every word of `query` (in the key, title, authors, year or venue), best first: works whose key
 * starts with what was typed, then whose key holds it, then whose title holds every word, then the rest; each group
 * in the order the works were written. With nothing typed, all of them in that order.
 */
export function matchReferences(works: readonly Reference[], query: string): Reference[] {
  const terms = wordsOf(query);
  if (terms.length === 0) return [...works];
  const typed = query.trim().toLowerCase();
  const found: { work: Reference; score: number; at: number }[] = [];
  works.forEach((work, at) => {
    const text = haystack(work);
    if (!terms.every((term) => text.includes(term))) return;
    const key = work.key.toLowerCase();
    const title = work.title.toLowerCase();
    const score = key.startsWith(typed) ? 0 : key.includes(typed) ? 1 : terms.every((term) => title.includes(term)) ? 2 : 3;
    found.push({ work, score, at });
  });
  return found.sort((a, b) => a.score - b.score || a.at - b.at).map((f) => f.work);
}
