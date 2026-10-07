// The Chat view: this session's threads beside the open
// one. Every thread is an agent session of its own on the backend, so what
// it changes shows in History and can be undone in one step.

import { useLayoutEffect } from "react";

import type { NoteMeta } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";
import { activeTab } from "../workspace/tabs";
import { noteAt } from "../workspace/tree";
import { useChat } from "./store";
import { Conversation, useChatSetup } from "./view/Conversation";
import { ThreadList } from "./view/ThreadList";

/** A page showing in another pane, which "This page" adds. */
function usePageBeside(): NoteMeta | null {
  const path = useWorkspace((s) => {
    for (const pane of s.layout.panes) {
      const place = activeTab(pane).place;
      if (place.view === "page" && place.path) return place.path;
    }
    return null;
  });
  return useWorkspace((s) => (path ? (noteAt(s.notes, path) ?? null) : null));
}

export function ChatView() {
  useChatSetup();
  const active = useChat((s) => (s.active && s.threads[s.active] ? s.active : null));
  const page = usePageBeside();
  // The view always has a thread to write in. The store is asked afresh, so
  // running twice (React's strict mode) still makes one.
  useLayoutEffect(() => {
    const chat = useChat.getState();
    if (!chat.active || !chat.threads[chat.active]) chat.start({ open: true });
  }, [active]);
  if (!active) return null;
  return (
    <div className="kasten-chat-view">
      <ThreadList active={active} />
      <Conversation id={active} variant="full" page={page} autoFocus />
    </div>
  );
}
