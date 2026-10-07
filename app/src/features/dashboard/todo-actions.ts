// Ticking and adding to-dos from a dashboard. Each is one core op on the
// note; a page open on it writes its typing first and reloads after, so
// the editor never saves over the change (as the right panel does).

import { splitFrontmatter } from "../pages/markdown/frontmatter";
import type { NoteFile, TaskRow } from "../../lib/vault/types";
import { pageFor, reloadOpenPage } from "../workspace/page/open-page";
import { useWorkspace } from "../workspace/store";
import { setTask, tasksIn } from "../workspace/tasks";
import { useTaskRows } from "./task-rows";

/** The heading a project page keeps its own to-dos under. */
export const TODO_HEADING = "To-dos";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Takes in a write to the note at `path`: the list, and a page open on it. */
function landed(path: string, note: NoteFile): void {
  useWorkspace.getState().noteChanged(note.meta);
  const page = pageFor(path);
  if (page && !page.adopt(note)) reloadOpenPage(path);
  void useTaskRows.getState().load();
}

/** Ticks a to-do, or unticks it. */
export async function tickTask(row: TaskRow): Promise<void> {
  const { client, toast } = useWorkspace.getState();
  if (!client) return;
  try {
    await pageFor(row.path)?.flush();
    const fresh = await client.read(row.path);
    const body = splitFrontmatter(fresh.text).body;
    const task = tasksIn(body).find((t) => t.line === row.line && t.done === row.done);
    const next = task ? setTask(body, task, !row.done) : null;
    if (next === null) return toast("That to-do changed meanwhile; open the page to tick it");
    useTaskRows.getState().patch(row, !row.done);
    const saved = await client.saveBody(fresh.meta.path, next, fresh.hash);
    landed(row.path, saved.note);
  } catch (err) {
    toast(message(err));
    void useTaskRows.getState().load();
  }
}

/** Whether the body has a heading called `heading`, at any level. */
export function hasHeading(body: string, heading: string): boolean {
  const wanted = heading.trim().toLowerCase();
  let fence = false;
  for (const line of body.split(/\r?\n/)) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    const m = !fence && /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (m && m[1]!.trim().toLowerCase() === wanted) return true;
  }
  return false;
}

/** Adds an open to-do at the end of the page's "To-dos" section, which is
 * made at the end of the page the first time. False when it was refused. */
export async function addTodo(path: string, text: string): Promise<boolean> {
  const { client, toast } = useWorkspace.getState();
  const words = text.replace(/\s+/g, " ").trim();
  if (!client || !words) return false;
  const line = `- [ ] ${words}`;
  try {
    await pageFor(path)?.flush();
    const { body } = splitFrontmatter((await client.read(path)).text);
    const saved = hasHeading(body, TODO_HEADING) ? await client.append(path, line, TODO_HEADING) : await client.append(path, `## ${TODO_HEADING}\n\n${line}`, null);
    landed(path, saved);
    return true;
  } catch (err) {
    toast(message(err));
    return false;
  }
}
