// What a project's home does to the vault: its settings and summary go into
// the project page's properties (the core's update_props, one commit each);
// new pages, boards and quick notes are made in the project's folder.

import type { NoteMeta } from "../../lib/vault/types";
import { useBoards } from "../boards/store";
import { writeProps } from "../calendar/write";
import { titleOf } from "../workspace/names";
import { useWorkspace } from "../workspace/store";
import { homeProp, type ProjectHomeSettings } from "./home";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Writes the project page's `home` property; hiding offers Undo. */
export async function saveHome(project: NoteMeta, settings: ProjectHomeSettings, undo = true): Promise<void> {
  const { client, noteChanged, toast } = useWorkspace.getState();
  if (!client) return;
  try {
    const saved = await writeProps(client, project.path, { home: homeProp(settings) });
    noteChanged(saved.meta);
    if (!settings.shown && undo) toast(`Hid the home of “${titleOf(saved.meta)}”. The page menu brings it back.`, { label: "Undo", run: () => void saveHome(saved.meta, { ...settings, shown: true }, false) });
  } catch (err) {
    toast(message(err));
  }
}

/** Writes the project's one-line summary, or removes it when empty. */
export async function saveSummary(project: NoteMeta, text: string): Promise<void> {
  const { client, noteChanged, toast } = useWorkspace.getState();
  if (!client) return;
  const summary = text.replace(/\s+/g, " ").trim();
  try {
    const saved = await writeProps(client, project.path, { summary: summary || null });
    noteChanged(saved.meta);
  } catch (err) {
    toast(message(err));
  }
}

/** A new, untitled page in the project, opened. */
export function newPage(folder: string): void {
  useWorkspace.getState().newPage({ project: folder });
}

/** A new whiteboard in the project, opened. */
export async function newBoard(folder: string, projectTitle: string): Promise<void> {
  const { client, openPath, toast } = useWorkspace.getState();
  if (!client) return;
  try {
    const path = await client.createBoard(`${projectTitle} board`, folder);
    await useBoards.getState().load();
    openPath(path);
  } catch (err) {
    toast(message(err));
  }
}
