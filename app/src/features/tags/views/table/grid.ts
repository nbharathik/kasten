// The table's geometry and keys, as numbers: which rows to draw for a
// scroll position, where to scroll so a cell shows, where the active cell
// is and where a key moves it. Pure, unit tested.

import type { NoteMeta } from "../../../../lib/vault/types";
import type { Column } from "./columns";

export interface Span {
  /** First row drawn. */
  start: number;
  /** One past the last row drawn. */
  end: number;
}

/** Rows assumed in view before the table is measured (and in tests). */
const UNMEASURED_ROWS = 30;

/** The rows to draw for a view `viewport` px tall at `offset` px down the
 * rows, with `overscan` more either side so fast scrolling finds them drawn. */
export function windowOf(offset: number, viewport: number, rowHeight: number, count: number, overscan = 8): Span {
  if (count <= 0) return { start: 0, end: 0 };
  const inView = Math.max(1, Math.ceil((viewport > 0 ? viewport : UNMEASURED_ROWS * rowHeight) / rowHeight));
  const first = Math.min(Math.floor(Math.max(0, offset) / rowHeight), Math.max(0, count - inView));
  return { start: Math.max(0, first - overscan), end: Math.min(count, first + inView + overscan) };
}

/** The scroll offset that shows `[start, start + size)` in a view `viewport`
 * long at `offset`, whose first `covered` px are under something sticky. */
export function reveal(offset: number, viewport: number, start: number, size: number, covered = 0): number {
  if (start - covered < offset) return Math.max(0, start - covered);
  if (start + size > offset + viewport) return start + size - viewport;
  return offset;
}

export interface CellAt {
  row: number;
  col: number;
}

/** The active cell: the note and column it is on, and where it was last
 * seen, for when that note or column goes (filtered out, hidden). */
export interface Active extends CellAt {
  path: string;
  key: string;
}

/** Where the active cell is now: on its note and column, wherever a sort or
 * a new row moved them, else where it was, kept inside the table. */
export function locate(active: Active | null, notes: readonly Pick<NoteMeta, "path">[], columns: readonly Pick<Column, "key">[]): CellAt | null {
  if (!active || notes.length === 0 || columns.length === 0) return null;
  const row = notes[active.row]?.path === active.path ? active.row : notes.findIndex((n) => n.path === active.path);
  const col = columns[active.col]?.key === active.key ? active.col : columns.findIndex((c) => c.key === active.key);
  return {
    row: row >= 0 ? row : Math.min(active.row, notes.length - 1),
    col: col >= 0 ? col : Math.min(active.col, columns.length - 1),
  };
}

export interface Bounds {
  rows: number;
  cols: number;
  /** Rows a page key moves by. */
  page: number;
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

/** Where `key` moves the active cell: the same cell at an edge, null for
 * keys that do not move it, and for Tab past either end (it leaves the grid). */
export function moveFor(key: string, shift: boolean, at: CellAt, { rows, cols, page }: Bounds): CellAt | null {
  if (rows <= 0 || cols <= 0) return null;
  const cell = (row: number, col: number) => ({ row: clamp(row, rows - 1), col: clamp(col, cols - 1) });
  switch (key) {
    case "ArrowUp":
      return cell(at.row - 1, at.col);
    case "ArrowDown":
      return cell(at.row + 1, at.col);
    case "ArrowLeft":
      return cell(at.row, at.col - 1);
    case "ArrowRight":
      return cell(at.row, at.col + 1);
    case "Home":
      return cell(at.row, 0);
    case "End":
      return cell(at.row, cols - 1);
    case "PageUp":
      return cell(at.row - page, at.col);
    case "PageDown":
      return cell(at.row + page, at.col);
    case "Tab": {
      const index = at.row * cols + at.col + (shift ? -1 : 1);
      if (index < 0 || index >= rows * cols) return null;
      return { row: Math.floor(index / cols), col: index % cols };
    }
    default:
      return null;
  }
}
