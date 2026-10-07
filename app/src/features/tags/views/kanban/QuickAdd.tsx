// "+ New" at the foot of a column: a title field whose Enter makes a page
// carrying the tag and the column's value in one commit, then stays open
// and empty for the next one. Escape, or leaving it empty, closes it.

import { useRef, useState } from "react";

import { useBoard } from "./context";
import { Icon } from "../../../../ui/Icon";

interface QuickAddProps {
  /** The column's value (null for "No <key>": the new note gets none) and heading. */
  value: string | null;
  label: string;
  onClose(): void;
}

export function QuickAdd({ value, label, onClose }: QuickAddProps) {
  const board = useBoard();
  const [title, setTitle] = useState("");
  const busy = useRef(false);
  const submit = async () => {
    const text = title.trim();
    if (!text || busy.current) return;
    busy.current = true;
    const made = await board.add(value, text);
    busy.current = false;
    if (made) setTitle("");
  };
  return (
    <form
      className="kasten-kanban-compose"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        autoFocus
        aria-label={`New card in ${label}`}
        placeholder="Title for the card…"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        onBlur={() => !title.trim() && onClose()}
      />
      <span className="kasten-kanban-compose-row">
        {/* Pressing these keeps the field focused, so it does not close first. */}
        <button type="submit" className="kasten-kanban-compose-add" disabled={!title.trim()} onMouseDown={(event) => event.preventDefault()}>
          Add card
        </button>
        <button type="button" className="kasten-kanban-compose-close" aria-label="Close" onMouseDown={(event) => event.preventDefault()} onClick={onClose}>
          <Icon name="close" className="size-3.5" />
        </button>
        <span className="kasten-kanban-compose-hint">Enter adds · Esc closes</span>
      </span>
    </form>
  );
}
