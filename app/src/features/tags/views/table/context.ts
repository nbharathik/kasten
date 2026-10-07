// What the table's rows and cells share: one stable object of callbacks
// (so a row redraws only when its own note or state changes), the handle
// keys reach the active cell through, and the row geometry.

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import type { OpenHow } from "../../../workspace/store";
import { sameValue } from "./format";

/** Row and header heights, in px; rows are all one height so they can be
 * windowed. They match --row-h and --head-h in table.css. */
export const ROW_HEIGHT = 36;
export const HEAD_HEIGHT = 36;

/** Where the active cell goes after an edit: Tab moves on, Shift+Tab back. */
export type Move = "next" | "prev" | null;

/** How keys pressed on the grid reach the active cell. */
export interface CellHandle {
  /** A key pressed while the cell is active and not editing; true when it used the key. */
  onKey(event: KeyboardEvent): boolean;
}

export interface TableCtx {
  /** The active cell's handle, while it is drawn. */
  handle: RefObject<CellHandle | null>;
  /** Makes a cell the active one; keys go to the grid. */
  activate(row: number, col: number): void;
  /** Opens a cell's editor, with the character typed to open it. */
  edit(path: string, key: string, seed?: string | null): void;
  /** Closes a cell's editor, moving on for Tab; keys go back to the grid
   * unless the editor closed because something else was clicked. */
  done(path: string, key: string, move?: Move, refocus?: boolean): void;
  open(path: string, how: OpenHow): void;
  /** Writes one property; false when the core refused it. */
  save(path: string, key: string, value: unknown): Promise<boolean>;
}

/** Keeps a ref pointing at this render's value, for handlers made once. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** Makes this cell's key handler the grid's while the cell is active. */
export function useCellHandle(ctx: TableCtx, active: boolean, onKey: (event: KeyboardEvent) => boolean): void {
  const latest = useLatest(onKey);
  useLayoutEffect(() => {
    if (!active) return;
    const handle: CellHandle = { onKey: (event) => latest.current(event) };
    ctx.handle.current = handle;
    return () => {
      if (ctx.handle.current === handle) ctx.handle.current = null;
    };
  }, [active, ctx, latest]);
}

interface Pending {
  value: unknown;
  /** Which save this is, so an older one finishing leaves a newer one shown. */
  token: object;
}

/** A value shown as saved at once while the core writes it; if the core
 * refuses, the saved value shows again. */
export function usePending(saved: unknown, write: (value: unknown) => Promise<boolean>): [unknown, (value: unknown) => void] {
  const [pending, setPending] = useState<Pending | null>(null);
  const shown = pending ? pending.value : saved;
  const latest = useLatest({ shown, write });
  const save = useCallback(
    (value: unknown) => {
      if (sameValue(latest.current.shown, value)) return;
      const token = {};
      setPending({ value, token });
      void latest.current.write(value).finally(() => setPending((p) => (p?.token === token ? null : p)));
    },
    [latest],
  );
  return [shown, save];
}
