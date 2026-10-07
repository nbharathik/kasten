// Where a page made from another note goes, by a `[[` link, /page or a
// database in it. Under a page or a project it is a sub-page. From anything
// else (a journal day, a card, a highlight) it is a page of its own, in the
// note's project if it has one. A sub-page of a journal day would sit in
// the journal's folder, where no one would find it.

import type { NoteMeta } from "../../../lib/vault/types";

/** The kinds whose notes hold sub-pages. */
export const HOLDS_PAGES: ReadonlySet<string> = new Set(["page", "project"]);

export function newPageHome(note: Pick<NoteMeta, "kind" | "path" | "project"> | undefined): { parent: string } | { project: string | null } {
  if (note && HOLDS_PAGES.has(note.kind)) return { parent: note.path };
  return { project: note?.project ?? null };
}
