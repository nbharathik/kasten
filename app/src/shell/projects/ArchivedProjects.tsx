import { memo, useEffect, useMemo, useRef, useState } from "react";

import { setArchived } from "../../features/workspace/project-actions";
import { projectKey } from "../../features/workspace/project-order";
import { useWorkspace } from "../../features/workspace/store";
import { noteAt } from "../../features/workspace/tree";
import type { NoteMeta } from "../../lib/vault/types";
import { Icon } from "../../ui/Icon";
import { TreeRow, type RowExtras } from "../PageTree";

/** Archived projects, folded under "Archived (N)" at the end of the
 * Projects list. They open, expand and turn up in search as usual; going to
 * one (from search, say) unfolds the group so the sidebar shows where it
 * is. Archiving the project on screen leaves the group folded: archiving
 * puts a project out of the way. */
export function ArchivedProjects({ notes }: { notes: NoteMeta[] }) {
  const [open, setOpen] = useState(false);
  const keys = useMemo(() => new Set(notes.map(projectKey)), [notes]);
  const current = useWorkspace((s) => (s.place.view === "page" ? s.place.path : undefined));
  const holdsCurrent = useWorkspace((s) => {
    const note = current ? noteAt(s.notes, current) : undefined;
    return Boolean(note && keys.has(projectKey(note)));
  });
  const shown = useRef(current);
  useEffect(() => {
    if (shown.current === current) return;
    shown.current = current;
    if (holdsCurrent) setOpen(true);
  }, [current, holdsCurrent]);

  return (
    <li className="mt-0.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-[28px] w-full items-center gap-1 rounded-lg pl-1 pr-2 text-left text-13 text-muted transition-colors hover:bg-hover hover:text-ink"
      >
        <span className="grid size-5 shrink-0 place-items-center">
          <Icon name="chevron" className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        </span>
        <span className="flex-1">Archived ({notes.length})</span>
      </button>
      {open && (
        <ul>
          {notes.map((note) => (
            <ArchivedRow key={note.path} note={note} />
          ))}
        </ul>
      )}
    </li>
  );
}

const ArchivedRow = memo(function ArchivedRow({ note }: { note: NoteMeta }) {
  const extras = useMemo<RowExtras>(
    () => ({
      item: { className: "text-muted" },
      menu: ["divider", { label: "Unarchive", icon: <Icon name="undo" className="size-4" />, onSelect: () => void setArchived(note, false) }],
    }),
    [note],
  );
  return <TreeRow note={note} depth={1} extras={extras} />;
});
