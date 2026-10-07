// Property writes from the calendar, through the core's `update_props` op.
// A page open on the same note writes its waiting typing first and then
// takes the change in (or reloads), so its next save builds on the new
// version instead of merging or conflicting, as the right panel does.

import type { NoteFile, VaultClient } from "../../lib/vault/types";
import { pageFor, reloadOpenPage } from "../workspace/page/open-page";

export async function writeProps(client: VaultClient, path: string, props: Record<string, unknown>): Promise<NoteFile> {
  const page = pageFor(path);
  await page?.flush();
  const saved = await client.updateProps(path, props);
  if (page && !page.adopt(saved)) reloadOpenPage(path);
  return saved;
}
