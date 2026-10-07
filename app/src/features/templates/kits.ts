// Adding a starter kit and saving a page as a template, from wherever the
// app offers them: the gallery, Settings, the page menu. Each is one change
// in the vault; a kit's toast offers Undo, which takes the whole kit back.

import type { KitInfo } from "../../lib/vault/types";
import { flushOpenPage } from "../workspace/page/use-note-session";
import { reloadLists } from "../workspace/reload";
import { useWorkspace } from "../workspace/store";
import { templateName } from "../workspace/tree";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** What a kit adds, in words: "2 pages, a journal template and 1 tag database". */
export function kitContents(kit: KitInfo): string {
  const count = (test: (path: string) => boolean) => kit.files.filter(test).length;
  const pages = count((p) => p.endsWith(".md") && !p.startsWith("templates/"));
  const journal = kit.files.includes("templates/journal.md");
  const templates = count((p) => p.startsWith("templates/") && p !== "templates/journal.md");
  const tags = count((p) => p.startsWith("tags/"));
  const boards = count((p) => p.endsWith(".canvas"));
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const parts = [
    pages ? plural(pages, "page") : "",
    templates ? plural(templates, "template") : "",
    journal ? "a journal template" : "",
    tags ? plural(tags, "tag database") : "",
    boards ? plural(boards, "whiteboard") : "",
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "");
}

/** Whether the vault has the kit already: its home page is there. */
export const hasKit = (kit: KitInfo, notes: readonly { path: string }[]) => notes.some((n) => n.path === kit.home);

/** Adds `kit`, opens its home page and offers Undo. False when refused. */
export async function addKit(kit: KitInfo): Promise<boolean> {
  const { client, toast } = useWorkspace.getState();
  if (!client) return false;
  try {
    // Typing waiting to be written goes first, as its own change.
    await flushOpenPage();
    const added = await client.addKit(kit.id);
    await reloadLists();
    useWorkspace.getState().openPath(added.home);
    const kept = added.kept.length ? ` Kept ${added.kept.length} of your own file${added.kept.length === 1 ? "" : "s"} as they were.` : "";
    const commit = added.commit;
    toast(
      `Added ${kit.name}.${kept}`,
      commit
        ? {
            label: "Undo",
            run: () =>
              void client
                .undoCommit(commit)
                .then(() => reloadLists())
                .then(
                  () => useWorkspace.getState().toast(`Took ${kit.name} back out`),
                  (err: unknown) => useWorkspace.getState().toast(message(err)),
                ),
          }
        : undefined,
    );
    return true;
  } catch (err) {
    toast(message(err));
    return false;
  }
}

/** Saves the page at `path` as a template named `name`; its template name, or null. */
export async function saveAsTemplate(path: string, name: string): Promise<string | null> {
  const { client, toast } = useWorkspace.getState();
  if (!client) return null;
  try {
    await flushOpenPage();
    const made = await client.saveAsTemplate(path, name);
    await useWorkspace.getState().refresh();
    toast(`Saved “${name.trim()}” as a template`);
    return templateName(made.meta);
  } catch (err) {
    toast(message(err));
    return null;
  }
}
