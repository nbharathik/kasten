// "Ask AI" on a project's summary: the chat, grounded in the project page
// and its latest notes, asked for a short summary. Kept apart from the
// home's other actions so menus that hide or show a home load no chat code.

import { useShell } from "../../lib/store";
import type { NoteMeta } from "../../lib/vault/types";
import { openProviders } from "../chat/actions";
import { cardsChip } from "../chat/context";
import { useChat } from "../chat/store";
import { titleOf } from "../workspace/names";
import { useWorkspace } from "../workspace/store";

/** Asks the chat for a summary of the project, grounded in its page and
 * its latest notes. Opens the chat; Settings when no AI is set up. */
export async function askForSummary(project: NoteMeta, notes: readonly NoteMeta[]): Promise<void> {
  const chat = useChat.getState();
  useShell.getState().toggleChat(true);
  const id = chat.active && chat.threads[chat.active] ? chat.active : chat.start({ open: true });
  if (chat.threads[id]?.streaming) {
    useWorkspace.getState().toast("The chat is still answering; ask for the summary when it is done");
    return;
  }
  chat.addChip(id, { ...cardsChip([project, ...notes.slice(0, 11)]), label: `${titleOf(project)} and its notes` });
  // The providers load when the chat first draws, which may not have happened yet.
  if (useChat.getState().providers === null) await chat.loadProviders();
  const title = titleOf(project);
  const sent = await chat.send(id, `Summarize the project [[${title}]] in a few lines: what it is about, where it stands, the open to-dos and what to do next.`);
  if (!sent) useWorkspace.getState().toast("Set up an AI provider in Settings to ask for a summary", { label: "Set up", run: () => openProviders() });
}
