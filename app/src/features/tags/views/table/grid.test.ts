import { describe, expect, it } from "vitest";

import type { NoteMeta } from "../../../../lib/vault/types";
import type { Column } from "./columns";
import { locate, moveFor, reveal, windowOf } from "./grid";

describe("where the active cell is", () => {
  const notes = ["a.md", "b.md", "c.md"].map((path) => ({ path }) as NoteMeta);
  const columns = ["title", "status", "due"].map((key) => ({ key }) as Column);
  const on = (path: string, key: string, row: number, col: number) => ({ path, key, row, col });

  it("follows its note and column when a sort or a new row moves them", () => {
    expect(locate(on("b.md", "due", 1, 2), notes, columns)).toEqual({ row: 1, col: 2 });
    expect(locate(on("c.md", "status", 0, 1), notes, columns)).toEqual({ row: 2, col: 1 });
    expect(locate(on("a.md", "due", 0, 1), notes, columns)).toEqual({ row: 0, col: 2 });
  });

  it("stays where it was, inside the table, when its note or column is gone", () => {
    expect(locate(on("gone.md", "status", 1, 1), notes, columns)).toEqual({ row: 1, col: 1 });
    expect(locate(on("gone.md", "hidden", 7, 9), notes, columns)).toEqual({ row: 2, col: 2 });
    expect(locate(null, notes, columns)).toBeNull();
    expect(locate(on("a.md", "title", 0, 0), [], columns)).toBeNull();
  });
});

describe("the rows drawn", () => {
  it("draws the rows in view and a few either side", () => {
    // 36px rows, 360px of view scrolled to row 100.
    expect(windowOf(3600, 360, 36, 2000, 5)).toEqual({ start: 95, end: 115 });
    expect(windowOf(0, 360, 36, 2000, 5)).toEqual({ start: 0, end: 15 });
    expect(windowOf(0, 360, 36, 4, 5)).toEqual({ start: 0, end: 4 });
    // Scrolled past the end (rows removed meanwhile): the last rows.
    expect(windowOf(99_999, 360, 36, 50, 5)).toEqual({ start: 35, end: 50 });
    expect(windowOf(0, 360, 36, 0, 5)).toEqual({ start: 0, end: 0 });
  });

  it("assumes a screenful before the table is measured", () => {
    const { start, end } = windowOf(0, 0, 36, 2000, 5);
    expect(start).toBe(0);
    expect(end).toBeGreaterThanOrEqual(20);
    expect(end).toBeLessThanOrEqual(60);
  });
});

describe("scrolling a cell into view", () => {
  it("keeps the offset when the cell shows, else brings it just in", () => {
    // A 400px view at 1000, with 34px covered by the sticky header.
    expect(reveal(1000, 400, 1100, 36, 34)).toBe(1000);
    expect(reveal(1000, 400, 1010, 36, 34)).toBe(976);
    expect(reveal(1000, 400, 1380, 36, 34)).toBe(1016);
    expect(reveal(10, 400, 20, 36, 34)).toBe(0);
  });
});

describe("moving the active cell", () => {
  const bounds = { rows: 10, cols: 4, page: 5 };
  const at = (row: number, col: number) => ({ row, col });

  it("moves by arrows, stopping at the edges", () => {
    expect(moveFor("ArrowDown", false, at(0, 0), bounds)).toEqual(at(1, 0));
    expect(moveFor("ArrowUp", false, at(0, 2), bounds)).toEqual(at(0, 2));
    expect(moveFor("ArrowRight", false, at(3, 3), bounds)).toEqual(at(3, 3));
    expect(moveFor("ArrowLeft", false, at(3, 3), bounds)).toEqual(at(3, 2));
    expect(moveFor("ArrowDown", false, at(9, 1), bounds)).toEqual(at(9, 1));
  });

  it("jumps with Home, End and the page keys", () => {
    expect(moveFor("Home", false, at(4, 2), bounds)).toEqual(at(4, 0));
    expect(moveFor("End", false, at(4, 2), bounds)).toEqual(at(4, 3));
    expect(moveFor("PageDown", false, at(4, 2), bounds)).toEqual(at(9, 2));
    expect(moveFor("PageUp", false, at(4, 2), bounds)).toEqual(at(0, 2));
  });

  it("tabs across and on to the next row; leaves the grid past either end", () => {
    expect(moveFor("Tab", false, at(0, 1), bounds)).toEqual(at(0, 2));
    expect(moveFor("Tab", false, at(0, 3), bounds)).toEqual(at(1, 0));
    expect(moveFor("Tab", true, at(1, 0), bounds)).toEqual(at(0, 3));
    expect(moveFor("Tab", false, at(9, 3), bounds)).toBeNull();
    expect(moveFor("Tab", true, at(0, 0), bounds)).toBeNull();
  });

  it("ignores other keys and empty tables", () => {
    expect(moveFor("a", false, at(0, 0), bounds)).toBeNull();
    expect(moveFor("ArrowDown", false, at(0, 0), { rows: 0, cols: 4, page: 5 })).toBeNull();
  });
});
