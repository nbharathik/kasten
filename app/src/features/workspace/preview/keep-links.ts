// The preview vault's links, as kasten-core has them: ops keep
// links going where they went, and backlinks, stats and verify follow a
// link by path, or by title to the note in its own project first.

import type { Backlink, NoteMeta } from "../../../lib/vault/types";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { Directory, keepLinks, pathKey, placeOf, titleKey, type Resolution } from "../links";
import { wikiLinks } from "./vault-text";

/** Rewrites the links an op would send elsewhere, across every note in
 * `after`, with `put`. `before` and `after` are every note's metadata on
 * either side of the op; `moved` maps old paths to new ones. Returns the
 * paths written. */
export function keepInFiles(
  text: (path: string) => string | undefined,
  put: (path: string, text: string) => void,
  before: readonly NoteMeta[],
  after: readonly NoteMeta[],
  moved: ReadonlyMap<string, string> = new Map(),
): string[] {
  const [was, now] = [new Directory(before), new Directory(after)];
  const back = new Map([...moved].map(([from, to]) => [to, from]));
  const wasAt = new Map(before.map((n) => [n.path, n]));
  const written: string[] = [];
  for (const note of after) {
    if (note.kind === "template" || note.path.startsWith("templates/")) continue;
    const stored = text(note.path);
    if (stored === undefined) continue;
    const prior = wasAt.get(back.get(note.path) ?? note.path) ?? note;
    const { prefix, body } = splitFrontmatter(stored);
    const kept = keepLinks(body, was, now, moved, placeOf(prior), placeOf(note));
    if (kept === null) continue;
    put(note.path, prefix + kept);
    written.push(note.path);
  }
  return written;
}

/** The notes a link goes to: one, or those it asks among. */
export function reached(found: Resolution): NoteMeta[] {
  if (!found) return [];
  return "note" in found ? [found.note] : found.choices;
}

/** The first line of `body`, written in `from`, with a link that reaches
 * the note at `path`. */
export function lineReaching(body: string, dir: Directory, from: NoteMeta, path: string): string | undefined {
  const place = placeOf(from);
  return body.split(/\r?\n/).find((line) => wikiLinks(line).some((target) => reached(dir.resolve(target, place)).some((n) => n.path === path)));
}

/** For each note, the other notes whose links reach it. */
export function linkingByNote(notes: readonly NoteMeta[], bodyOf: (path: string) => string): Map<string, Set<string>> {
  const dir = new Directory(notes);
  const out = new Map<string, Set<string>>();
  for (const note of notes) {
    if (note.kind === "template") continue;
    for (const target of wikiLinks(bodyOf(note.path))) {
      for (const to of reached(dir.resolve(target, placeOf(note)))) {
        if (to.path === note.path) continue;
        const set = out.get(to.path);
        if (set) set.add(note.path);
        else out.set(to.path, new Set([note.path]));
      }
    }
  }
  return out;
}

/** The notes whose links reach the note at `path`, one row per note with
 * the line that does. `targetsOf` gives a note's link targets, lowercased,
 * to pass over notes that cannot link it. */
export function backlinksIn(notes: readonly NoteMeta[], path: string, bodyOf: (path: string) => string, targetsOf: (path: string) => Set<string>): Backlink[] {
  const me = notes.find((n) => n.path === path);
  if (!me) return [];
  const dir = new Directory(notes);
  const keys = [titleKey(me.title), pathKey(path), `${pathKey(path)}.md`];
  const out: Backlink[] = [];
  for (const note of notes) {
    if (note.kind === "template" || note.path === path || !keys.some((k) => targetsOf(note.path).has(k))) continue;
    const line = lineReaching(bodyOf(note.path), dir, note, path);
    if (line !== undefined) out.push({ path: note.path, title: note.title, icon: note.icon, snippet: line.trim().slice(0, 200) });
  }
  return out;
}
