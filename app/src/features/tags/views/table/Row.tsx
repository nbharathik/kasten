// One row: a note's cells. Rows are memoised on what they show (the note,
// its place, which of its cells is active or edited) with stable callbacks,
// so an edit, a keypress or a scroll redraws only the rows it touches.

import { memo } from "react";

import type { NoteMeta } from "../../../../lib/vault/types";
import { Cell } from "./Cell";
import type { Column } from "./columns";
import type { TableCtx } from "./context";

export interface RowProps {
  note: NoteMeta;
  /** Its place among the rows shown, from 0. */
  row: number;
  columns: Column[];
  /** The active cell's column in this row, or -1. */
  activeCol: number;
  /** The key edited in this row, if any. */
  editingKey: string | null;
  seed: string | null;
  /** Just added from the table: it glows for a moment. */
  fresh: boolean;
  ctx: TableCtx;
  idBase: string;
}

/** A cell's element id, for the grid's active descendant. */
export const cellId = (base: string, row: number, col: number) => `${base}-${row}-${col}`;

export const Row = memo(function Row({ note, row, columns, activeCol, editingKey, seed, fresh, ctx, idBase }: RowProps) {
  return (
    <div role="row" aria-rowindex={row + 2} className={`kasten-table-row${fresh ? " is-fresh" : ""}`}>
      {columns.map((column, col) => (
        <Cell
          key={column.key}
          note={note}
          column={column}
          row={row}
          col={col}
          active={activeCol === col}
          editing={editingKey === column.key}
          seed={editingKey === column.key ? seed : null}
          ctx={ctx}
          id={cellId(idBase, row, col)}
        />
      ))}
      <div role="presentation" className="kasten-table-fill" />
    </div>
  );
});
