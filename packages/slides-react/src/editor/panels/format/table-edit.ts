// Adding and taking away the last row or column of a table. A table is drawn
// to fill its box, so the box grows and shrinks with what is added and taken
// away, and the rows and columns that stay keep the size they are drawn at.

import type { TableCell, TableEl, TableRow } from "@kasten-slides/wasm";

import { layoutTable } from "../../../render/table-layout.ts";
import { plainText } from "../../factory.ts";
import type { Box } from "../../session/types.ts";
import { round2 } from "./values.ts";

/** The parts of a table that change, as a patch. */
export interface TableChange {
  rows: TableRow[];
  columns: number[];
  w: number;
  h: number;
}

type Direction = "row" | "column";

const empty = (): TableCell => ({ text: plainText("") });
const without = <K extends string>(cell: TableCell, key: K): TableCell => {
  const { [key]: _gone, ...rest } = cell as TableCell & Record<K, unknown>;
  return rest as TableCell;
};

/** A cell with its spans cut to `colSpan` and `rowSpan`; a span of 1 is not written. */
function spanned(cell: TableCell, colSpan: number, rowSpan: number): TableCell {
  let out = colSpan > 1 ? { ...cell, colSpan } : without(cell, "colSpan");
  out = rowSpan > 1 ? { ...out, rowSpan } : without(out, "rowSpan");
  return out;
}

/** Whether the table has room to lose a row or a column. */
export const canShrink = (table: TableEl, along: Direction): boolean => (along === "row" ? table.rows.length : table.columns.length) > 1;

/**
 * The table with one more row or column at the end, `room` slide units being
 * all the slide leaves it to grow into (the box stays inside the slide).
 */
export function grow(table: TableEl, box: Box, along: Direction, room: number): TableChange {
  const laid = layoutTable(table, box.w, box.h);
  const rowCount = table.rows.length;
  const colCount = laid.columns.length;
  // Spans reach only as far as the table did, so nothing already there covers the new places.
  const start = new Map(laid.cells.flat().map((l) => [l.cell, l.col]));
  const rows = table.rows.map((row, r) => ({
    ...row,
    height: round2(laid.rows[r] ?? 0),
    cells: row.cells.map((cell) => spanned(cell, Math.min(cell.colSpan ?? 1, colCount - (start.get(cell) ?? 0)), Math.min(cell.rowSpan ?? 1, rowCount - r))),
  }));
  if (along === "row") {
    const height = round2(box.h / Math.max(rowCount, 1));
    return { rows: [...rows, { height, cells: Array.from({ length: colCount }, empty) }], columns: laid.columns.map(round2), w: box.w, h: round2(Math.min(box.h + height, Math.max(box.h, room))) };
  }
  const width = round2(box.w / Math.max(colCount, 1));
  return { rows: rows.map((row) => ({ ...row, cells: [...row.cells, empty()] })), columns: [...laid.columns.map(round2), width], w: round2(Math.min(box.w + width, Math.max(box.w, room))), h: box.h };
}

/** The table without its last row or column. Cells that stretched over it are cut short. */
export function shrink(table: TableEl, box: Box, along: Direction): TableChange {
  const laid = layoutTable(table, box.w, box.h);
  const rowCount = table.rows.length;
  const colCount = laid.columns.length;
  const start = new Map(laid.cells.flat().map((l) => [l.cell, l.col]));
  if (along === "row") {
    const rows = table.rows.slice(0, -1).map((row, r) => ({
      ...row,
      height: round2(laid.rows[r] ?? 0),
      cells: row.cells.map((cell) => spanned(cell, cell.colSpan ?? 1, Math.min(cell.rowSpan ?? 1, rowCount - 1 - r))),
    }));
    return { rows, columns: laid.columns.map(round2), w: box.w, h: round2(box.h - (laid.rows[rowCount - 1] ?? 0)) };
  }
  const rows = table.rows.map((row, r) => ({
    ...row,
    height: round2(laid.rows[r] ?? 0),
    cells: row.cells.flatMap((cell) => {
      const at = start.get(cell);
      // A cell the layout leaves out (past the last column) goes with the column it would have been in.
      if (at === undefined || at >= colCount - 1) return [];
      return [spanned(cell, Math.min(cell.colSpan ?? 1, colCount - 1 - at), cell.rowSpan ?? 1)];
    }),
  }));
  return { rows, columns: laid.columns.slice(0, -1).map(round2), w: round2(box.w - (laid.columns[colCount - 1] ?? 0)), h: box.h };
}
