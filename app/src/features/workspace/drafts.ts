// Pages not made yet. "New page" opens a draft: a place in a tab that says
// what the page will be (its kind, project or parent), with no file behind
// it. Its first input (typing, a title, an icon, a template, a project)
// makes the page, in one commit, and the tab follows it to its path. A
// draft left untouched leaves nothing behind. Drafts live in this window's
// memory only: a reload forgets them.

import type { NewNote, NoteFile } from "../../lib/vault/types";

/** What a draft becomes: the note to make, but for its day and body. */
export type DraftSpec = Omit<NewNote, "date" | "body">;

const PREFIX = "draft:";
/** The hash a draft's (empty) text carries, so its first save is known. */
export const DRAFT_HASH = "draft";

const specs = new Map<string, DraftSpec>();
/** Drafts made into notes: the note each first became, and back. */
const made = new Map<string, NoteFile>();
const madeFrom = new Map<string, string>();
let seq = 0;

/** Whether `path` is a draft's place rather than a note's. */
export const isDraft = (path: string | null | undefined): boolean => typeof path === "string" && path.startsWith(PREFIX);

/** A new draft, and its place's path. */
export function newDraft(spec: DraftSpec): string {
  const path = `${PREFIX}${Date.now().toString(36)}${(++seq).toString(36)}`;
  specs.set(path, spec);
  return path;
}

/** What the draft at `path` will be, while it is one. */
export const draftSpec = (path: string | null | undefined): DraftSpec | undefined => (path ? specs.get(path) : undefined);

/** The note a draft became, once made. */
export const madeOf = (path: string): NoteFile | undefined => made.get(path);

/** Where `path` is now: a made draft's note, or itself. */
export const nowAt = (path: string): string => made.get(path)?.meta.path ?? path;

/** Records that the draft at `path` became `note`. */
export function markMade(path: string, note: NoteFile): void {
  specs.delete(path);
  made.set(path, note);
  madeFrom.set(note.meta.path, path);
}

/** One key for a draft and the page it became, so a view that shows the
 * draft goes on as the same view when the page is made. */
export const placeKey = (path: string): string => madeFrom.get(path) ?? path;

/** Forgets a draft that was never written in. */
export function dropDraft(path: string): void {
  specs.delete(path);
}

/** A draft's page as the editor opens it: nothing yet but what it was
 * asked to be. */
export function draftFile(path: string): NoteFile {
  const spec = specs.get(path) ?? { kind: "page", title: "" };
  const title = spec.title.trim();
  const lines = [title && `title: ${JSON.stringify(title)}`, spec.icon && `icon: ${JSON.stringify(spec.icon)}`].filter(Boolean);
  return {
    meta: {
      path,
      id: null,
      title,
      kind: spec.kind,
      icon: spec.icon ?? null,
      cover: null,
      parent: null,
      project: spec.project ?? null,
      tags: [],
      modified: 0,
      created: null,
      updated: null,
      excerpt: "",
      words: 0,
      props: {},
      locked: false,
    },
    text: lines.length ? `---\n${lines.join("\n")}\n---\n` : "",
    hash: DRAFT_HASH,
  };
}
