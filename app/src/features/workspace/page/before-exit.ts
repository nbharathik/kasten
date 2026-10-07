// Before the app restarts on another vault or a new version, every open
// page's waiting typing is written and committed, so what was typed a
// moment ago goes into history with the rest.

import { useWorkspace } from "../store";
import { flushOpenPage } from "./open-page";
import { writeUnsavedNow } from "./unsaved";

/** How long the pages get to write before the app goes ahead anyway. */
const WAIT_MS = 2_500;

/** Writes every open page's waiting typing, then commits it. Never throws:
 * the app writes and commits on exit too. */
export async function writeEverything(): Promise<void> {
  try {
    await Promise.race([flushOpenPage(), new Promise((done) => setTimeout(done, WAIT_MS))]);
  } catch {
    // A page that could not write says so itself.
  }
  writeUnsavedNow();
  try {
    await useWorkspace.getState().client?.commitEdits();
  } catch {
    // Committed on exit instead.
  }
}
