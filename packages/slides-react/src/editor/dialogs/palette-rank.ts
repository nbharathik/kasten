// Finding things in the insert palette: which entries the words typed match,
// and in what order. Every word has to match, in the name, in a keyword given
// for the entry, or (weakly) in the name of its group.

/** What the words are matched against. */
export interface Searchable {
  label: string;
  /** Other words the entry may be looked for by ("equation" for a formula). */
  keywords?: readonly string[];
  group?: string;
}

const words = (text: string): string[] => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Whether the letters of `token` appear in `text` in order, though not together. */
function scattered(token: string, text: string): boolean {
  let at = 0;
  for (const letter of token) {
    at = text.indexOf(letter, at);
    if (at < 0) return false;
    at += 1;
  }
  return true;
}

/** How well one word matches an entry, 0 for not at all. */
function tokenScore(token: string, label: string, keywords: readonly string[], group: string): number {
  let best = 0;
  if (label === token) best = 100;
  else if (label.startsWith(token)) best = 90;
  else if (words(label).some((word) => word.startsWith(token))) best = 70;
  else if (label.includes(token)) best = 40;
  else if (keywords.some((keyword) => keyword === token || keyword.startsWith(token) || words(keyword).some((word) => word.startsWith(token)))) best = 30;
  else if (keywords.some((keyword) => keyword.includes(token))) best = 20;
  else if (token.length >= 3 && scattered(token, label)) best = 10;
  else if (words(group).some((word) => word.startsWith(token))) best = 5;
  return best;
}

/**
 * How well the words typed match an entry: 0 when any word fails to, else more
 * the better they fit. A name that starts with the whole query gets a bonus, and
 * of two that fit alike the shorter name scores higher.
 */
export function scoreOf(query: string, entry: Searchable): number {
  const typed = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (typed.length === 0) return 0;
  const label = entry.label.toLowerCase();
  const keywords = (entry.keywords ?? []).map((keyword) => keyword.toLowerCase());
  const group = (entry.group ?? "").toLowerCase();
  let total = 0;
  for (const token of typed) {
    const score = tokenScore(token, label, keywords, group);
    if (score === 0) return 0;
    total += score;
  }
  if (typed.length > 1 && label.startsWith(typed.join(" "))) total += 30;
  return total - label.length * 0.01;
}

/** The entries that match the words typed, best first; all of them, as given, when nothing is typed. */
export function rank<T extends Searchable>(query: string, entries: readonly T[]): T[] {
  if (query.trim() === "") return [...entries];
  return entries
    .map((entry, index) => ({ entry, index, score: scoreOf(query, entry) }))
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((scored) => scored.entry);
}
