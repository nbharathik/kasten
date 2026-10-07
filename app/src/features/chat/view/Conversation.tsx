// One thread, as the Chat view and the window's chat dock show it: a
// header with its actions, the messages, and the message box.

import "../../pages/editor/styles/tokens.css";
import "../chat.css";
import "../threads.css";
import "../messages.css";
import "../composer.css";
import "../menus.css";

import { useEffect, useMemo, useRef, useState } from "react";

import type { NoteMeta } from "../../../lib/vault/types";
import { Icon } from "../../../ui/Icon";
import { useBoards } from "../../boards/store";
import { useWorkspace } from "../../workspace/store";
import { saveChat } from "../actions";
import { useChat } from "../store";
import { threadTitle, type Thread } from "../thread";
import { Composer, type ComposerHandle } from "./Composer";
import { NoProvider, Welcome } from "./Empty";
import { LinksContext, linksFor, type Variant } from "./links";
import { MessageList } from "./MessageList";
import { ThreadMenu } from "./ThreadList";

/** Connects the chat, reads the providers and the boards (for names) once. */
export function useChatSetup(): void {
  useEffect(() => {
    const chat = useChat.getState();
    chat.ensure();
    if (chat.providers === null) void chat.loadProviders();
    if (!useBoards.getState().loaded) void useBoards.getState().load();
  }, []);
}

interface Props {
  id: string;
  variant: Variant;
  /** The page "This page" adds. */
  page: NoteMeta | null;
  autoFocus?: boolean;
  /** The window's dock: its header switches threads and closes it. */
  onClose?: () => void;
}

export function Conversation({ id, variant, page, autoFocus = false, onClose }: Props) {
  const thread = useChat((s) => s.threads[id]);
  const providers = useChat((s) => s.providers);
  const problem = useChat((s) => s.providersError);
  const links = useMemo(() => linksFor(variant), [variant]);
  const composer = useRef<ComposerHandle>(null);
  if (!thread) return null;
  const none = providers !== null && providers.length === 0;
  return (
    <LinksContext.Provider value={links}>
      <section className="kasten-chat" data-variant={variant} aria-label="Chat">
        {onClose ? <DockHead thread={thread} onClose={onClose} /> : <Head thread={thread} />}
        <MessageList thread={thread} empty={none ? <NoProvider problem={problem} /> : <Welcome thread={thread} onPick={(text) => composer.current?.fill(text)} />} />
        <div className="kasten-chat-foot">
          <Composer key={thread.id} ref={composer} thread={thread} page={page} autoFocus={autoFocus} />
        </div>
      </section>
    </LinksContext.Provider>
  );
}

/** The Chat view's header: the chats, the thread's title and keeping it as a note. */
function Head({ thread }: { thread: Thread }) {
  const [saving, setSaving] = useState(false);
  const title = threadTitle(thread);
  const canSave = thread.messages.length > 0 && !thread.streaming && !saving;
  const save = async () => {
    setSaving(true);
    await saveChat(thread.id);
    setSaving(false);
  };
  return (
    <header className="kasten-chat-head">
      <ThreadMenu active={thread.id} />
      <h1 className="kasten-chat-title" title={title}>
        {title}
      </h1>
      <button type="button" className="kasten-chat-head-button" disabled={!canSave} onClick={() => void save()} title="Keep this chat as a note in chats/">
        {saving ? "Saving…" : "Save chat"}
      </button>
    </header>
  );
}

/** The dock's header: the chats, a new one, keeping it as a note, the Chat
 * view and closing. */
function DockHead({ thread, onClose }: { thread: Thread; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  const title = threadTitle(thread);
  const canSave = thread.messages.length > 0 && !thread.streaming && !saving;
  return (
    <header className="kasten-chat-head">
      <ThreadMenu active={thread.id} />
      <span className="kasten-chat-title" title={title}>
        {thread.messages.length ? title : "New chat"}
      </span>
      <button type="button" className="kasten-chat-icon-button" aria-label="New chat" title="New chat" disabled={thread.messages.length === 0} onClick={() => useChat.getState().start({ open: true })}>
        <Icon name="compose" className="size-4" />
      </button>
      <button
        type="button"
        className="kasten-chat-icon-button"
        aria-label="Save chat"
        title="Keep this chat as a note in chats/"
        disabled={!canSave}
        onClick={async () => {
          setSaving(true);
          await saveChat(thread.id);
          setSaving(false);
        }}
      >
        <Icon name="download" className="size-4" />
      </button>
      <button
        type="button"
        className="kasten-chat-icon-button"
        aria-label="Open in the Chat view"
        title="Open in the Chat view"
        onClick={() => {
          useChat.getState().open(thread.id);
          useWorkspace.getState().go({ view: "chat" }, "tab");
          onClose();
        }}
      >
        <Icon name="expand" className="size-4" />
      </button>
      <button type="button" className="kasten-chat-icon-button" aria-label="Close the chat" title="Close the chat" onClick={onClose}>
        <Icon name="close" className="size-4" />
      </button>
    </header>
  );
}
