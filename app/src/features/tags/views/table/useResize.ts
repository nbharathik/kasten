// Column widths by dragging a header's edge (or its arrow keys). While
// dragging, only the grid's column template changes, so no row redraws;
// the width is saved into the view once, when the drag ends. Keys save
// after a short pause.

import { useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

import { clampWidth, gridTemplate, type Column } from "./columns";
import { useLatest } from "./context";

/** The CSS variable every row reads its columns from. */
export const COLS_VAR = "--kasten-table-cols";

export interface Resizer {
  start(event: ReactPointerEvent, index: number): void;
  key(event: ReactKeyboardEvent, index: number): void;
}

const KEY_STEP = 10;
const KEY_PAUSE = 400;

/** A width the keys changed, painted and waiting for its pause to be saved. */
interface Waiting {
  widths: number[];
  index: number;
  timer: ReturnType<typeof setTimeout>;
}

export function useResize(grid: RefObject<HTMLElement | null>, columns: Column[], widths: number[], commit: (column: Column, width: number) => void): Resizer {
  const latest = useLatest({ columns, widths, commit });
  const waiting = useRef<Waiting | null>(null);

  return useMemo<Resizer>(() => {
    const paint = (next: readonly number[]) => grid.current?.style.setProperty(COLS_VAR, gridTemplate(next));
    /** Saves a width the keys changed now, before another column's or a
     * drag's, so neither is lost or saved over. */
    const flush = () => {
      const w = waiting.current;
      if (!w) return;
      clearTimeout(w.timer);
      waiting.current = null;
      const column = latest.current.columns[w.index];
      if (column) latest.current.commit(column, w.widths[w.index]!);
    };
    return {
      start(event, index) {
        if (event.button !== 0) return;
        const { columns, widths } = latest.current;
        const column = columns[index];
        if (!column) return;
        event.preventDefault();
        event.stopPropagation();
        const handle = event.currentTarget;
        const from = event.clientX;
        const base = (waiting.current?.widths ?? widths).slice();
        flush();
        let width = base[index]!;
        let frame = 0;
        const draw = () => paint(base.map((w, i) => (i === index ? width : w)));
        const move = (e: PointerEvent) => {
          width = clampWidth(column, base[index]! + e.clientX - from);
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(draw);
        };
        const end = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          cancelAnimationFrame(frame);
          document.body.classList.remove("kasten-table-resizing");
          handle.classList.remove("is-dragging");
          draw();
          if (width !== base[index]) latest.current.commit(column, width);
        };
        document.body.classList.add("kasten-table-resizing");
        handle.classList.add("is-dragging");
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
      },
      key(event, index) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        event.stopPropagation();
        const { columns, widths } = latest.current;
        const column = columns[index];
        if (!column) return;
        const next = (waiting.current?.widths ?? widths).slice();
        if (waiting.current?.index === index) clearTimeout(waiting.current.timer);
        else flush();
        const step = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? KEY_STEP * 5 : KEY_STEP);
        next[index] = clampWidth(column, next[index]! + step);
        paint(next);
        const timer = setTimeout(() => {
          waiting.current = null;
          latest.current.commit(column, next[index]!);
        }, KEY_PAUSE);
        waiting.current = { widths: next, index, timer };
      },
    };
  }, [grid, latest]);
}
