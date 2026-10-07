// The sidebar's Projects list: drag to reorder,
// pin or archive. Pinned projects come first, then the rest in the
// order the person set by dragging a row, with Alt+↑/↓ or from the row's
// menu; archived projects fold under "Archived (N)" at the end.

import { Fragment, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";

import { usePrefs } from "../../features/workspace/prefs";
import { moveProject, useProjectLists } from "../../features/workspace/project-actions";
import { groupOf, projectKey, slotOf, targetOf } from "../../features/workspace/project-order";
import { onOwnRow, takeDrop, wouldMove } from "../drop-into";
import { ArchivedProjects } from "./ArchivedProjects";
import { ProjectRow, type ListActions } from "./ProjectRow";

/** The data type a project row carries while dragged, besides its note
 * (NOTE_DRAG, for boards). Only this list takes it: to reorder. A page
 * dragged onto a project row moves into that project. */
export const PROJECT_DRAG = "application/x-kasten-project";

interface Drag {
  key: string;
  /** Where the insertion line is (before row i; the row count is after the
   * last), or null where a drop would change nothing. */
  slot: number | null;
}

/** The project rows; `children` (the new-project field) sit between the
 * list and the archived group. */
export function ProjectList({ children }: { children?: ReactNode }) {
  const { active, archived } = useProjectLists();
  const pinnedProjects = usePrefs((s) => s.pinnedProjects);
  const shown = useMemo(() => active.map(projectKey), [active]);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** The project a dragged page would move into. */
  const [into, setInto] = useState<string | null>(null);
  const latest = useRef({ active, shown, pinnedProjects, drag });
  latest.current = { active, shown, pinnedProjects, drag };
  /** The project a keyboard or menu move is for, to focus again once it moved. */
  const refocus = useRef<string | null>(null);

  useLayoutEffect(() => {
    const key = refocus.current;
    refocus.current = null;
    if (!key) return;
    for (const item of document.querySelectorAll<HTMLElement>("[data-project]")) {
      if (item.dataset.project === key) item.querySelector<HTMLElement>("[data-row-title]")?.focus();
    }
  }, [shown]);

  const actions = useMemo<ListActions>(() => {
    const move = (index: number, to: number) => {
      const { shown } = latest.current;
      refocus.current = shown[index] ?? null;
      if (!moveProject(shown, index, to)) refocus.current = null;
    };
    /** Where the dragged project lands for the pointer over row `index`:
     * above it in the row's top half, below it otherwise (a project's open
     * pages count as its bottom), kept within the dragged project's group. */
    const target = (event: DragEvent<HTMLLIElement>, index: number) => {
      const { shown, pinnedProjects, drag } = latest.current;
      const from = drag ? shown.indexOf(drag.key) : -1;
      if (from < 0) return null;
      const row = (event.currentTarget.firstElementChild ?? event.currentTarget).getBoundingClientRect();
      const slot = event.clientY < row.top + row.height / 2 ? index : index + 1;
      const { start, end } = groupOf(shown, pinnedProjects, from);
      return { from, to: Math.min(Math.max(targetOf(from, slot), start), end) };
    };
    const carries = (event: DragEvent) => event.dataTransfer.types.includes(PROJECT_DRAG);
    /** The folder of the project at `index`, for a page dragged onto it. */
    const folder = (index: number) => latest.current.active[index]?.project ?? null;
    return {
      move,
      pin(key) {
        refocus.current = key;
        usePrefs.getState().togglePinnedProject(key);
      },
      start(key, event) {
        event.dataTransfer.setData(PROJECT_DRAG, key);
        // Boards copy the note; this list moves the row.
        event.dataTransfer.effectAllowed = "all";
        setDrag({ key, slot: null });
      },
      over(index, event) {
        const project = folder(index);
        if (!carries(event) && project && wouldMove(event, project, onOwnRow(event))) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setInto(latest.current.shown[index] ?? null);
          return;
        }
        const at = carries(event) ? target(event, index) : null;
        if (!at) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const slot = at.to === at.from ? null : slotOf(at.from, at.to);
        setDrag((d) => (d && d.slot !== slot ? { ...d, slot } : d));
      },
      drop(index, event) {
        setInto(null);
        const project = folder(index);
        const own = onOwnRow(event);
        if (!carries(event) && project && wouldMove(event, project, own)) return takeDrop(event, project, own);
        const at = carries(event) ? target(event, index) : null;
        if (!at) return;
        event.preventDefault();
        setDrag(null);
        if (at.to !== at.from) moveProject(latest.current.shown, at.from, at.to);
      },
      leave(event) {
        const next = event.relatedTarget instanceof Element ? event.relatedTarget : null;
        if (!next?.closest("[data-project]")) setDrag((d) => (d && d.slot !== null ? { ...d, slot: null } : d));
        if (!next || !event.currentTarget.contains(next)) setInto(null);
      },
      end() {
        setDrag(null);
        setInto(null);
      },
      keys(index, event) {
        if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        // Alt+arrows in the rename field move the caret, not the row.
        if (event.target instanceof HTMLInputElement) return;
        event.preventDefault();
        const { shown, pinnedProjects } = latest.current;
        const { start, end } = groupOf(shown, pinnedProjects, index);
        const to = index + (event.key === "ArrowUp" ? -1 : 1);
        if (to >= start && to <= end) move(index, to);
      },
    };
  }, []);

  const pins = new Set(pinnedProjects);
  const pinnedCount = shown.filter((key) => pins.has(key)).length;
  const line = drag?.slot ?? null;
  return (
    <>
      {active.map((note, index) => {
        const pinned = index < pinnedCount;
        return (
          <Fragment key={note.path}>
            {line === index && <DropLine />}
            <ProjectRow
              note={note}
              index={index}
              pinned={pinned}
              up={index > (pinned ? 0 : pinnedCount)}
              down={index < (pinned ? pinnedCount : active.length) - 1}
              dragging={drag?.key === shown[index]}
              into={into === shown[index]}
              actions={actions}
            />
          </Fragment>
        );
      })}
      {line === active.length && <DropLine />}
      {children}
      {archived.length > 0 && <ArchivedProjects notes={archived} />}
    </>
  );
}

/** Where a dragged project would go: a line between two rows that takes
 * no room, so nothing shifts while dragging. */
function DropLine() {
  return (
    <li aria-hidden="true" data-drop-line="" className="pointer-events-none relative h-0">
      <span className="absolute inset-x-1 -top-px h-0.5 rounded-full bg-accent" />
    </li>
  );
}
