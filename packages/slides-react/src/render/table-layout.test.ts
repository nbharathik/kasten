// @vitest-environment node

import type { TableCell, TableRow } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { layoutTable, MOST_COLUMNS, MOST_PLACES, MOST_ROWS } from "./table-layout.ts";

const cell = (extra: Partial<TableCell> = {}): TableCell => ({ text: { paragraphs: [] }, ...extra });
const row = (cells: TableCell[], height?: number): TableRow => ({ cells, ...(height === undefined ? {} : { height }) });
const at = (layout: ReturnType<typeof layoutTable>) => layout.cells.map((cells) => cells.map((c) => [c.row, c.col, c.colSpan, c.rowSpan]));

describe("layoutTable", () => {
  it("uses the column widths, and an equal share of the box for each row", () => {
    const layout = layoutTable({ columns: [200, 200], rows: [row([cell(), cell()]), row([cell(), cell()])] }, 400, 90);
    expect(layout.columns).toEqual([200, 200]);
    expect(layout.rows).toEqual([45, 45]);
    expect(layout.cells[0]?.map((c) => [c.width, c.height])).toEqual([
      [200, 45],
      [200, 45],
    ]);
  });

  it("scales the columns and the rows to the box, so a resized table still fills it", () => {
    const layout = layoutTable({ columns: [100, 300], rows: [row([cell(), cell()], 20), row([cell(), cell()], 60)] }, 200, 160);
    expect(layout.columns).toEqual([50, 150]);
    expect(layout.rows).toEqual([40, 120]);
  });

  it("gives the rows without a height what the others leave", () => {
    const layout = layoutTable({ columns: [100], rows: [row([cell()], 20), row([cell()]), row([cell()])] }, 100, 100);
    expect(layout.rows).toEqual([20, 40, 40]);
  });

  it("shares the box equally when the sizes are all zero", () => {
    const layout = layoutTable({ columns: [0, 0], rows: [row([cell(), cell()], 0), row([cell(), cell()])] }, 100, 50);
    expect(layout.columns).toEqual([50, 50]);
    expect(layout.rows).toEqual([25, 25]);
  });

  it("finds the columns from the widest row when no widths are listed", () => {
    const layout = layoutTable({ columns: [], rows: [row([cell(), cell(), cell()]), row([cell({ colSpan: 2 })])] }, 300, 60);
    expect(layout.columns).toEqual([100, 100, 100]);
  });

  it("places cells the way HTML does, and sums the sizes of what a cell covers", () => {
    const layout = layoutTable(
      {
        columns: [100, 100, 100],
        rows: [
          row([cell({ colSpan: 2 }), cell({ rowSpan: 2 })], 30),
          row([cell(), cell()], 30),
          row([cell(), cell(), cell()], 40),
        ],
      },
      300,
      100,
    );
    expect(at(layout)).toEqual([
      [
        [0, 0, 2, 1],
        [0, 2, 1, 2],
      ],
      [
        [1, 0, 1, 1],
        [1, 1, 1, 1],
      ],
      [
        [2, 0, 1, 1],
        [2, 1, 1, 1],
        [2, 2, 1, 1],
      ],
    ]);
    expect(layout.cells[0]?.map((c) => [c.width, c.height])).toEqual([
      [200, 30],
      [100, 60],
    ]);
  });

  it("keeps a span inside the table, and leaves out a cell past the last column", () => {
    const layout = layoutTable({ columns: [50, 50], rows: [row([cell({ colSpan: 5 }), cell()]), row([cell({ rowSpan: 9 }), cell(), cell()])] }, 100, 40);
    expect(at(layout)).toEqual([[[0, 0, 2, 1]], [[1, 0, 1, 1], [1, 1, 1, 1]]]);
  });

  it("marks the first row as the header only when the table has one", () => {
    const rows = [row([cell()]), row([cell()])];
    expect(layoutTable({ columns: [10], rows, headerRow: true }, 10, 10).cells.map((cells) => cells.map((c) => c.header))).toEqual([[true], [false]]);
    expect(layoutTable({ columns: [10], rows }, 10, 10).cells.map((cells) => cells.map((c) => c.header))).toEqual([[false], [false]]);
  });

  it("counts a span of four billion columns as the widest table there may be, and lays it out at once", () => {
    const started = Date.now();
    const layout = layoutTable({ columns: [], rows: [row([cell({ colSpan: 4294967295 }), cell({ colSpan: 4294967295 })])] }, 1000, 40);
    expect(layout.columns).toHaveLength(MOST_COLUMNS);
    expect(at(layout)).toEqual([[[0, 0, MOST_COLUMNS, 1]]]);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("draws no more rows than the limits allow, so a table of a hundred thousand rows costs no more than the largest there may be", () => {
    const rows = (count: number) => Array.from({ length: count }, () => row([cell()]));
    expect(layoutTable({ columns: [10], rows: rows(100_000) }, 10, 10).rows).toHaveLength(MOST_ROWS);
    expect(layoutTable({ columns: new Array<number>(MOST_COLUMNS).fill(1), rows: rows(1000) }, 10, 10).rows).toHaveLength(MOST_PLACES / MOST_COLUMNS);
    expect(layoutTable({ columns: [1, 1], rows: rows(3) }, 10, 10).rows).toHaveLength(3);
  });

  it("lays out a table with nothing in it", () => {
    expect(layoutTable({ columns: [], rows: [] }, 100, 100)).toEqual({ columns: [], rows: [], cells: [] });
  });
});
