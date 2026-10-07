// The chat, docked at the right of the window and the same wherever you are:
// one conversation about what is open, rather than a
// thread per page. The pages open in any pane, the side stack or a peek
// are its context, kept up to date as they change; removing that chip
// leaves it out until other pages are opened or closed.

import { useEffect, useLayoutEffect, useRef } from "react";

import { useShell } from "../../lib/store";
import type { NoteMeta } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";
import { noteAt } from "../workspace/tree";
import { cardsChip, noteChip } from "./context";
import { useOpenNotes } from "./open-pages";
import { useChat } from "./store";
import { chipKey } from "./thread";
import { Conversation, useChatSetup } from "./view/Conversation";

export function ChatDock() {
  useChatSetup();
  const active = useChat((s) => (s.active && s.threads[s.active] ? s.active : null));
  const open = useOpenNotes();
  // Which pages are open, not each save of one: the chip follows this.
  const openKey = open.map((note) => note.path).join("\n");
  const shown = useRef<{ thread: string; key: string } | null>(null);

  // There is always a thread to write in.
  useLayoutEffect(() => {
    const chat = useChat.getState();
    if (!chat.active || !chat.threads[chat.active]) chat.start({ open: true });
  }, [active]);

  // The open pages, as one chip that follows them.
  useEffect(() => {
    if (!active) return;
    const chat = useChat.getState();
    const before = shown.current;
    if (before && before.thread === active) chat.removeChip(active, before.key);
    const { notes } = useWorkspace.getState();
    const pages = openKey
      .split("\n")
      .map((path) => noteAt(notes, path))
      .filter((note): note is NoteMeta => Boolean(note));
    if (pages.length === 0) {
      shown.current = null;
      return;
    }
    const chip = pages.length === 1 ? noteChip(pages[0]!) : { ...cardsChip(pages), label: `${pages.length} open pages` };
    chat.addChip(active, chip);
    shown.current = { thread: active, key: chipKey(chip) };
  }, [active, openKey]);

  if (!active) return null;
  return (
    <aside className="kasten-chat-dock" aria-label="Chat dock">
      <Conversation id={active} variant="dock" page={open[0] ?? null} autoFocus onClose={() => useShell.getState().toggleChat(false)} />
    </aside>
  );
}
