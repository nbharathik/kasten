// Wiki links and the notes they go to, as kasten-core's links
// module has them. A link names a note by its path, or by a title that
// goes to the note in the linking note's project first; when that does not
// pick one, the reader chooses. After a rename or a move, `keepLinks`
// rewrites a link that would go elsewhere so it goes where it went.

import type { NoteMeta } from "../../lib/vault/types";

export interface LinkParts {
  target: string;
  heading: string | null;
  alias: string | null;
}

/** Splits a link's inner text at its first `|`, then its first `#`. */
export function linkParts(inner: string): LinkParts {
  const bar = inner.indexOf("|");
  const head = bar < 0 ? inner : inner.slice(0, bar);
  const hash = head.indexOf("#");
  return {
    target: (hash < 0 ? head : head.slice(0, hash)).trim(),
    heading: hash < 0 ? null : head.slice(hash + 1).trim(),
    alias: bar < 0 ? null : inner.slice(bar + 1),
  };
}

/** A path as a link names it: lowercase, without `.md`. */
export function pathKey(path: string): string {
  const lower = path.trim().toLowerCase();
  return lower.endsWith(".md") ? lower.slice(0, -3) : lower;
}

export const titleKey = (title: string) => title.trim().toLowerCase();

/** Where a link is written: its note's path and project. */
export interface Place {
  path: string;
  project?: string | null;
}

export const placeOf = (note: Pick<NoteMeta, "path" | "project">): Place => ({ path: note.path, project: note.project ?? null });

/** Where a link goes: a note, notes to choose from, or none. */
export type Resolution = { note: NoteMeta } | { choices: NoteMeta[] } | null;

const isTemplate = (note: NoteMeta) => note.kind === "template" || note.path.startsWith("templates/");
const byPath = (a: NoteMeta, b: NoteMeta) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
/** Whether a title can stand as a link's target as it is. */
const linkable = (title: string) => title.trim() !== "" && !/[[\]|#]/.test(title);

/** The vault's notes by path and by title, to follow links. Templates are
 * left out: no link goes to one. */
export class Directory {
  private readonly paths = new Map<string, NoteMeta>();
  private readonly titles = new Map<string, NoteMeta[]>();

  constructor(notes: readonly NoteMeta[]) {
    for (const note of notes) {
      if (isTemplate(note)) continue;
      this.paths.set(pathKey(note.path), note);
      const key = titleKey(note.title);
      const list = this.titles.get(key);
      if (list) list.push(note);
      else this.titles.set(key, [note]);
    }
    for (const list of this.titles.values()) list.sort(byPath);
  }

  /** The note at `path`, in any case. */
  note(path: string): NoteMeta | undefined {
    return this.paths.get(pathKey(path));
  }

  /** Notes with this title, by path. */
  titled(title: string): readonly NoteMeta[] {
    return this.titles.get(titleKey(title)) ?? [];
  }

  /** Where a link to `target`, written at `from`, goes. */
  resolve(target: string, from: Place): Resolution {
    const wanted = target.trim();
    if (wanted.includes("/") || wanted.toLowerCase().endsWith(".md")) {
      const note = this.note(wanted);
      if (note) return { note };
    }
    const all = this.titled(wanted);
    // A note's link to its own title means another note by that title.
    const others = all.filter((n) => n.path !== from.path);
    const candidates = others.length > 0 ? others : [...all];
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return { note: candidates[0]! };
    const project = from.project ?? null;
    const near = candidates.filter((n) => (n.project ?? null) === project);
    if (near.length === 1) return { note: near[0]! };
    return { choices: near.length > 0 ? near : candidates };
  }

  /** How a link at `from` names `note`: its title when that finds it, else
   * its path with the title to show. */
  targetFor(note: NoteMeta, from: Place): { target: string; alias: string | null } {
    const found = linkable(note.title) ? this.resolve(note.title, from) : null;
    if (found && "note" in found && found.note.path === note.path) return { target: note.title.trim(), alias: null };
    const shown = note.title.replace(/[[\]|]/g, "").trim();
    return { target: note.path.replace(/\.md$/, ""), alias: shown || null };
  }

  /** A link's inner text for `note`, written at `from`: `Title` or `path|Title`. */
  inner(note: NoteMeta, from: Place): string {
    const { target, alias } = this.targetFor(note, from);
    return alias ? `${target}|${alias}` : target;
  }
}

const directories = new WeakMap<readonly NoteMeta[], Directory>();

/** The directory of a notes list, made once per list. */
export function directoryOf(notes: readonly NoteMeta[]): Directory {
  let dir = directories.get(notes);
  if (!dir) {
    dir = new Directory(notes);
    directories.set(notes, dir);
  }
  return dir;
}

/** An open code fence: its character and run length. */
export type Fence = [string, number];

/** A fence opener or closer: its character and run length. */
function fenceMarker(line: string): Fence | null {
  const trimmed = line.trimStart();
  if (line.length - trimmed.length > 3) return null;
  const c = trimmed[0];
  if (c !== "`" && c !== "~") return null;
  let n = 0;
  while (trimmed[n] === c) n++;
  return n >= 3 ? [c, n] : null;
}

/** A line read against the code fence open before it (as kasten-core's
 * extract.rs reads it): the fence open after it, and whether the line
 * opened or closed one. A fence closes on a line of its character, at
 * least as long, with nothing else on it. */
export function fenceAfter(fence: Fence | null, line: string): [Fence | null, boolean] {
  const marker = fenceMarker(line);
  if (!marker) return [fence, false];
  if (!fence) return [marker, true];
  const closes = fence[0] === marker[0] && marker[1] >= fence[1] && line.trim().length === marker[1];
  return [closes ? null : fence, true];
}

/** Each link's inner text as [start, end) offsets, where the index finds
 * links: outside code fences and code spans, not escaped. */
export function linkSpans(body: string): [number, number][] {
  const out: [number, number][] = [];
  let fence: Fence | null = null;
  let offset = 0;
  for (const raw of body.split(/(?<=\n)/)) {
    const start = offset;
    offset += raw.length;
    const line = raw.replace(/\r?\n$/, "");
    const [after, marker] = fenceAfter(fence, line);
    fence = after;
    if (marker || fence || !line.includes("[[")) continue;
    let code = false;
    for (let i = 0; i < line.length; ) {
      if (line[i] === "`") {
        code = !code;
        i++;
        continue;
      }
      if (code || line[i] !== "[" || line[i + 1] !== "[") {
        i++;
        continue;
      }
      const inner = i + 2;
      const end = line.indexOf("]]", inner);
      if (end < 0) break;
      const text = line.slice(inner, end);
      if (line[i - 1] !== "\\" && text !== "" && !/[[`]/.test(text)) out.push([start + inner, start + end]);
      i = end + 2;
    }
  }
  return out;
}

/** `body` with each link that went to one note before an op, and would go
 * elsewhere after it, naming that note again. `moved` maps old paths to new
 * ones. Links that asked which note, or found none, stay as written. Null
 * when nothing changed. */
export function keepLinks(
  body: string,
  before: Directory,
  after: Directory,
  moved: ReadonlyMap<string, string>,
  fromBefore: Place,
  fromAfter: Place,
): string | null {
  let out = "";
  let last = 0;
  for (const [start, end] of linkSpans(body)) {
    const kept = keptLink(body.slice(start, end), before, after, moved, fromBefore, fromAfter);
    if (kept === null) continue;
    out += body.slice(last, start) + kept;
    last = end;
  }
  return last === 0 ? null : out + body.slice(last);
}

function keptLink(inner: string, before: Directory, after: Directory, moved: ReadonlyMap<string, string>, fromBefore: Place, fromAfter: Place): string | null {
  const cut = inner.search(/[|#]/);
  const target = (cut < 0 ? inner : inner.slice(0, cut)).trim();
  const was = before.resolve(target, fromBefore);
  if (!was || !("note" in was)) return null;
  const now = after.note(moved.get(was.note.path) ?? was.note.path);
  if (!now) return null;
  const rest = cut < 0 ? "" : inner.slice(cut);
  const [heading, alias] = rest.startsWith("#")
    ? rest.includes("|")
      ? [rest.slice(1, rest.indexOf("|")), rest.slice(rest.indexOf("|") + 1)]
      : [rest.slice(1), null]
    : [null, rest.startsWith("|") ? rest.slice(1) : null];
  // An alias that only repeated the title follows the title.
  const aliasWasTitle = alias !== null && titleKey(alias) === titleKey(was.note.title);
  const found = after.resolve(target, fromAfter);
  const goes = found !== null && "note" in found && found.note.path === now.path;
  if (goes && !(aliasWasTitle && was.note.title !== now.title)) return null;
  const named = after.targetFor(now, fromAfter);
  const shown = alias !== null && !aliasWasTitle ? alias : named.alias;
  const text = `${named.target}${heading !== null ? `#${heading}` : ""}${shown !== null ? `|${shown}` : ""}`;
  return text === inner ? null : text;
}

/** Nowhere in particular: a link copied to paste anywhere. */
const ANYWHERE: Place = { path: "", project: null };

/** A `[[link]]` to `note`, written at `from` (by default anywhere). */
export function linkFor(note: NoteMeta, notes: readonly NoteMeta[], from: Place = ANYWHERE): string {
  return `[[${directoryOf(notes).inner(note, from)}]]`;
}
