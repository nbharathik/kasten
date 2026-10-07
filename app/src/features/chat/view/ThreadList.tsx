// The chat's threads this session, the latest first: a list beside the
// conversation, or a menu in its header when the pane is narrow.

import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { Menu, openRowMenu } from "../../../shell/Menu";
import { saveChat } from "../actions";
import { useChat } from "../store";
import { threadTitle } from "../thread";
import { Icon } from "../../../ui/Icon";

interface Row {
  id: string;
  title: string;
  streaming: boolean;
  /** Nothing asked yet: nothing to save or remove. */
  empty: boolean;
}

const SEP = "\u0001";

/** Threads worth listing: those with messages, and the open one. As strings,
 * so a streaming answer does not redraw the list. */
function useRows(active: string | null): Row[] {
  const keys = useChat(
    useShallow((s) =>
      s.order.flatMap((id) => {
        const t = s.threads[id];
        if (!t || (t.messages.length === 0 && id !== active)) return [];
        return [[id, t.streaming ? "1" : "", t.messages.length ? "" : "1", threadTitle(t)].join(SEP)];
      }),
    ),
  );
  return useMemo(
    () =>
      keys.map((key) => {
        const [id = "", streaming, empty, title = ""] = key.split(SEP);
        return { id, title, streaming: Boolean(streaming), empty: Boolean(empty) };
      }),
    [keys],
  );
}

export function newChat(): void {
  const chat = useChat.getState();
  const current = chat.active ? chat.threads[chat.active] : undefined;
  // An empty chat is new enough.
  if (current && current.messages.length === 0) return;
  chat.start({ open: true });
}

export function ThreadList({ active }: { active: string }) {
  const rows = useRows(active);
  return (
    <aside className="kasten-chat-threads" aria-label="Chats">
      <button type="button" className="kasten-chat-new" onClick={newChat}>
        <span aria-hidden="true">+</span> New chat
      </button>
      <p className="kasten-chat-threads-label">This session</p>
      <ul>
        {rows.map((row) => (
            <li key={row.id} onContextMenu={openRowMenu}>
              <button type="button" aria-current={row.id === active ? "true" : undefined} onClick={() => useChat.getState().open(row.id)}>
                <span className="kasten-chat-thread-title">
                  {row.streaming && <span className="kasten-chat-live" role="img" aria-label="Answering" />}
                  {row.title}
                </span>
              </button>
              {!row.empty && (
                <Menu
                  label={`More for ${row.title}`}
                  float
                  buttonClass="kasten-chat-thread-more"
                  items={[
                    { label: "Save chat", onSelect: () => void saveChat(row.id) },
                    // The backend forgets it too; what it changed stays in History.
                    { label: "Remove from the list", onSelect: () => void useChat.getState().discard(row.id) },
                  ]}
                >
                  <Icon name="more" className="size-4" />
                </Menu>
              )}
            </li>
        ))}
      </ul>
      <p className="kasten-chat-threads-hint">Chats last while the window is open. Save one to keep it in chats/.</p>
    </aside>
  );
}

/** The same threads as a menu, for a narrow pane. */
export function ThreadMenu({ active }: { active: string }) {
  const rows = useRows(active);
  // The menu tells items apart by their words: the same question twice gets a number.
  const seen = new Map<string, number>();
  const items = rows.map((row) => {
    const n = (seen.get(row.title) ?? 0) + 1;
    seen.set(row.title, n);
    const label = n > 1 ? `${row.title} (${n})` : row.title;
    return { label: row.id === active ? `${label} ✓` : label, onSelect: () => useChat.getState().open(row.id) };
  });
  return (
    <span className="kasten-chat-thread-menu">
      <Menu label="Chats" align="left" buttonClass="kasten-chat-head-button" items={[{ label: "New chat", icon: <Icon name="plus" className="size-4" />, onSelect: newChat }, "divider", ...items]}>
        Chats <Icon name="chevron-down" className="size-3.5" />
      </Menu>
    </span>
  );
}
