import { useState } from "react";

import { dragNotes } from "../workspace/drag";
import { iconOf, titleOf } from "../workspace/names";
import { LazyNotePage } from "../workspace/page/LazyNotePage";
import { useNote, useWorkspace } from "../workspace/store";
import { Icon } from "../../ui/Icon";
import { IconOrEmoji } from "../../ui/IconOrEmoji";
import { lineIcon } from "../../ui/glyph";


const button = "ui-icon-btn is-sm";

/** One note in the side stack: its title bar and the page, editable in place. */
export function StackCard({ path, first, last }: { path: string; first: boolean; last: boolean }) {
  const note = useNote(path);
  const client = useWorkspace((s) => s.client);
  const [open, setOpen] = useState(true);
  const ws = useWorkspace.getState();
  if (!client) return null;
  return (
    <article className="kasten-stack-card" aria-label={note ? titleOf(note) : path}>
      <header className="kasten-stack-card-bar" draggable onDragStart={(e) => dragNotes(e, [path])}>
        <button type="button" className={button} aria-label={open ? "Collapse" : "Expand"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="chevron" className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-13 font-medium hover:underline" onClick={() => ws.openPath(path, "tab")} title="Open in a new tab">
          <IconOrEmoji icon={note ? iconOf(note) : lineIcon("page")} />
          <span className="truncate">{note ? titleOf(note) : path}</span>
        </button>
        <button type="button" className={button} aria-label="Move up" disabled={first} onClick={() => ws.moveInStack(path, -1)}>
          <Icon name="back" className="size-3.5 rotate-90" />
        </button>
        <button type="button" className={button} aria-label="Move down" disabled={last} onClick={() => ws.moveInStack(path, 1)}>
          <Icon name="forward" className="size-3.5 rotate-90" />
        </button>
        <button type="button" className={button} aria-label="Open in split view" title="Open in split view" onClick={() => ws.openPath(path, "split")}>
          <Icon name="split" className="size-3.5" />
        </button>
        <button type="button" className={button} aria-label="Close card" title="Close card" onClick={() => ws.closeInStack(path)}>
          <Icon name="close" className="size-3.5" />
        </button>
      </header>
      {open && (
        <div className="kasten-stack-card-body">
          {/* A link followed from a card opens in a new tab, keeping the page beside it. */}
          <LazyNotePage client={client} path={path} compact linksOpen="tab" />
        </div>
      )}
    </article>
  );
}
