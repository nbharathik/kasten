// A thread's context as chips above the message box, each with a remove
// button, and "+ Context" to add more.

import type { NoteMeta } from "../../../lib/vault/types";
import { useChat } from "../store";
import { chipKey, type Chip, type Thread } from "../thread";
import { AddContext } from "./AddContext";
import { Icon } from "../../../ui/Icon";
import type { IconName } from "../../../ui/icons";

const ICONS: Record<Chip["kind"], IconName> = { note: "page", cards: "cards", board: "board", tag: "tag", search: "search", deck: "present", slide: "present" };

export function ContextChips({ thread, page }: { thread: Thread; page: NoteMeta | null }) {
  return (
    <div className="kasten-chat-chips" role="group" aria-label="Context">
      {thread.context.map((chip) => {
        const key = chipKey(chip);
        return (
          <span key={key} className="kasten-chat-chip" data-kind={chip.kind} title={chip.label}>
            <span className="kasten-chat-chip-icon" aria-hidden="true">
              <Icon name={ICONS[chip.kind]} className="size-3.5" />
            </span>
            <span className="kasten-chat-chip-label">{chip.label}</span>
            <button type="button" aria-label={`Remove ${chip.label}`} onClick={() => useChat.getState().removeChip(thread.id, key)}>
              <Icon name="close" className="size-3" />
            </button>
          </span>
        );
      })}
      <AddContext thread={thread} page={page} />
    </div>
  );
}
