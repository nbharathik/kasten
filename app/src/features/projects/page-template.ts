// A project's default template for its new pages: kept in the project
// page's properties beside its home settings. "Template…" in the slash
// menu of one of its empty pages opens the gallery on it. Pages stay
// drafts, so nothing is written until the person picks it or types.

import type { NoteMeta } from "../../lib/vault/types";
import { writeProps } from "../calendar/write";
import { titleOf } from "../workspace/names";
import { useWorkspace } from "../workspace/store";
import { projects } from "../workspace/tree";

const KEY = "page_template";

/** The template a project's new pages start from, if it names one. */
export function pageTemplateOf(project: NoteMeta | undefined): string | null {
  const value = project?.props?.[KEY];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** The default template of the project `note` is in. */
export function projectTemplateFor(note: NoteMeta | undefined, notes: readonly NoteMeta[]): string | null {
  if (!note?.project) return null;
  return pageTemplateOf(projects(notes).find((p) => p.project === note.project));
}

/** Names `template` as the project's default, or none. */
export async function setPageTemplate(project: NoteMeta, template: string | null): Promise<void> {
  const { client, noteChanged, toast } = useWorkspace.getState();
  if (!client) return;
  try {
    const saved = await writeProps(client, project.path, { [KEY]: template });
    noteChanged(saved.meta);
    toast(template ? `New pages in “${titleOf(saved.meta)}” offer this template first` : `New pages in “${titleOf(saved.meta)}” start blank`);
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err));
  }
}
