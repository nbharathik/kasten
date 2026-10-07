// Relations point one way in the file: a paper's `related: [<id>]` names the
// note it relates to, and that note's file says nothing. The right panel
// shows them from the other end, so a relation can be followed both ways.

import type { NoteMeta, TagSchema } from "../../../lib/vault/types";
import { directoryOf, linkParts } from "../../workspace/links";
import { treeOf } from "../../workspace/tree";
import { asList } from "../properties/values";

export interface RelatedFrom {
  note: NoteMeta;
  /** The properties that point here, such as `related`. */
  keys: string[];
}

/** Shown for a relation value that names no note, or several. */
export const NOT_FOUND = "No page has this name, or several do";

/**
 * The note a relation value names, as the core reads one: its id, its path
 * (`.md` optional; a picker sends it for a note with no id yet, and the
 * core stores the id) or a title no other note has. A `[[link]]` names its
 * target. Templates are only named by id.
 */
export function relatedNote(notes: readonly NoteMeta[], value: string): NoteMeta | undefined {
  const trimmed = value.trim();
  const link = /^\[\[(.*)\]\]$/.exec(trimmed);
  const wanted = link ? linkParts(link[1]!).target : trimmed;
  if (!wanted) return undefined;
  const byId = treeOf(notes).byId.get(wanted);
  if (byId) return byId;
  const directory = directoryOf(notes);
  if (wanted.includes("/") || wanted.toLowerCase().endsWith(".md")) {
    const note = directory.note(wanted);
    if (note) return note;
  }
  const titled = directory.titled(wanted);
  return titled.length === 1 ? titled[0] : undefined;
}

/** The notes a relation value names by path, as a picker sends a note with
 * no id yet: saving gives them ids, which the page list then reads. */
export const namedByPath = (value: unknown): string[] => asList(value).filter((item) => item.trim().endsWith(".md"));

/**
 * The notes whose properties point at `target`: by its id in any property
 * (ids are unique), or by its path or title in a property a tag schema
 * calls a relation (written by hand or by another tool), when that names
 * this note and no other. Sorted by title.
 */
export function relatedFrom(notes: readonly NoteMeta[], target: NoteMeta, schemas: readonly TagSchema[]): RelatedFrom[] {
  const relationKeys = new Map<string, string[]>();
  for (const schema of schemas) {
    const keys = schema.properties.filter((p) => p.type === "relation").map((p) => p.key);
    if (keys.length) relationKeys.set(schema.name.toLowerCase(), keys);
  }
  const id = target.id?.trim() || null;
  const found: RelatedFrom[] = [];
  for (const note of notes) {
    if (note.path === target.path || note.kind === "template") continue;
    let relations: Set<string> | null = null;
    const keys: string[] = [];
    for (const [key, value] of Object.entries(note.props)) {
      const items = Array.isArray(value) ? value : [value];
      const points = items.some((item) => {
        if (typeof item !== "string") return false;
        if (id && item.trim() === id) return true;
        relations ??= new Set(note.tags.flatMap((t) => relationKeys.get(t.toLowerCase()) ?? []));
        return relations.has(key) && relatedNote(notes, item)?.path === target.path;
      });
      if (points) keys.push(key);
    }
    if (keys.length) found.push({ note, keys });
  }
  return found.sort((a, b) => a.note.title.localeCompare(b.note.title));
}
