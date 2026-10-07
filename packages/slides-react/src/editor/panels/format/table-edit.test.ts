import type { TableCell, TableEl } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { layoutTable } from "../../../render/table-layout.ts";
import { plainText } from "../../factory.ts";
import { canShrink, grow, shrink } from "./table-edit.ts";

const cell = (words: string, extra: Partial<TableCell> = {}): TableCell => ({ text: plainText(words), ...extra });
const grid = (rows: TableCell[][], columns: number[], heights?: number[]): TableEl =>
  ({ type: "table", id: "t", columns, rows: rows.map((cells, r) => ({ ...(heights ? { height: heights[r] } : {}), cells })) }) as TableEl;
const box = { x: 0, y: 0, w: 300, h: 100 };
const words = (table: { rows: { cells: TableCell[] }[] }) => table.rows.map((row) => row.cells.map((c) => c.text.paragraphs[0]?.runs[0]?.t));

describe("growing a table", () => {
  const table = grid([[cell("a"), cell("b")], [cell("c"), cell("d")]], [100, 200], [40, 60]);

  it("adds a row of empty cells, as tall as the rows are on average, and grows the box by it", () => {
    const next = grow(table, box, "row", 1000);
    expect(words(next)).toEqual([["a", "b"], ["c", "d"], ["", ""]]);
    expect(next.h).toBe(150);
    expect(next.w).toBe(300);
    // The rows and columns that were there keep the size they were drawn at.
    expect(next.rows.map((r) => r.height)).toEqual([40, 60, 50]);
    expect(next.columns).toEqual([100, 200]);
  });

  it("adds a column at the end of each row, as wide as the columns are on average", () => {
    const next = grow(table, box, "column", 1000);
    expect(words(next)).toEqual([["a", "b", ""], ["c", "d", ""]]);
    expect(next.columns).toEqual([100, 200, 150]);
    expect(next.w).toBe(450);
    expect(next.h).toBe(100);
  });

  it("draws the rows and columns at the size they had, scaling a table whose numbers were not the size of its box", () => {
    const loose = grid([[cell("a"), cell("b")]], [1, 3]);
    const next = grow(loose, { x: 0, y: 0, w: 400, h: 50 }, "column", 1000);
    expect(next.columns).toEqual([100, 300, 200]);
  });

  it("stays inside the room the slide leaves", () => {
    expect(grow(table, box, "row", 130).h).toBe(130);
    expect(grow(table, box, "column", 320).w).toBe(320);
    // A table already past the room does not shrink for lack of it.
    expect(grow(table, box, "row", 50).h).toBe(100);
  });

  it("cuts spans that reached past the table, so they do not swallow the new places", () => {
    const spanning = grid([[cell("a", { rowSpan: 9, colSpan: 9 }), cell("b")], [cell("c")]], [100, 200]);
    const rows = grow(spanning, box, "row", 1000);
    // Nine rows and nine columns were asked for by a table of two and two: it covers those two, and no more.
    expect(rows.rows[0]?.cells[0]).toMatchObject({ rowSpan: 2, colSpan: 2 });
    expect(rows.rows[2]?.cells).toHaveLength(2);
    const columns = grow(spanning, box, "column", 1000);
    expect(columns.rows[0]?.cells[0]).toMatchObject({ rowSpan: 2, colSpan: 2 });
    expect(columns.rows[0]?.cells.at(-1)?.text.paragraphs[0]?.runs[0]?.t).toBe("");
  });

  it("lays the new table out with a cell in each place", () => {
    const next = grow(table, box, "row", 1000);
    const laid = layoutTable({ ...table, rows: next.rows, columns: next.columns }, next.w, next.h);
    expect(laid.cells.map((row) => row.length)).toEqual([2, 2, 2]);
    expect(laid.rows).toEqual([40, 60, 50]);
  });
});

describe("shrinking a table", () => {
  const table = grid([[cell("a"), cell("b"), cell("c")], [cell("d"), cell("e"), cell("f")], [cell("g"), cell("h"), cell("i")]], [100, 100, 100], [30, 30, 40]);

  it("takes off the last row and the height it was drawn at", () => {
    const next = shrink(table, { x: 0, y: 0, w: 300, h: 100 }, "row");
    expect(words(next)).toEqual([["a", "b", "c"], ["d", "e", "f"]]);
    expect(next.h).toBe(60);
    expect(next.rows.map((r) => r.height)).toEqual([30, 30]);
  });

  it("takes off the last column and the width it was drawn at", () => {
    const next = shrink(table, { x: 0, y: 0, w: 300, h: 100 }, "column");
    expect(words(next)).toEqual([["a", "b"], ["d", "e"], ["g", "h"]]);
    expect(next.columns).toEqual([100, 100]);
    expect(next.w).toBe(200);
    expect(next.h).toBe(100);
  });

  it("cuts a span that stretched over what was taken off", () => {
    const spanning = grid([[cell("a"), cell("b", { colSpan: 2, rowSpan: 2 })], [cell("c")], [cell("d"), cell("e"), cell("f")]], [100, 100, 100]);
    const rows = shrink(spanning, { x: 0, y: 0, w: 300, h: 90 }, "row");
    expect(rows.rows[0]?.cells[1]).toMatchObject({ colSpan: 2, rowSpan: 2 });
    const columns = shrink(spanning, { x: 0, y: 0, w: 300, h: 90 }, "column");
    expect(columns.rows[0]?.cells[1]?.colSpan).toBeUndefined();
    expect(columns.rows[0]?.cells[1]?.rowSpan).toBe(2);
    expect(words(columns)).toEqual([["a", "b"], ["c"], ["d", "e"]]);
  });

  it("cuts a row span that reached the last row", () => {
    const spanning = grid([[cell("a", { rowSpan: 3 }), cell("b")], [cell("c")], [cell("d")]], [100, 100]);
    const next = shrink(spanning, { x: 0, y: 0, w: 200, h: 90 }, "row");
    expect(next.rows[0]?.cells[0]?.rowSpan).toBe(2);
  });

  it("knows when a table has nothing to spare", () => {
    expect(canShrink(table, "row")).toBe(true);
    expect(canShrink(grid([[cell("a")]], [100]), "row")).toBe(false);
    expect(canShrink(grid([[cell("a")]], [100]), "column")).toBe(false);
  });
});
