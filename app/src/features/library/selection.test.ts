import { describe, expect, it } from "vitest";

import { clickAction, columnsOf, moveFocus, selectRange, toggle } from "./selection";

const ORDER = ["a", "b", "c", "d", "e", "f"];

describe("toggle", () => {
  it("adds and removes without changing the old set", () => {
    const start = new Set(["a"]);
    expect([...toggle(start, "b")]).toEqual(["a", "b"]);
    expect([...toggle(start, "a")]).toEqual([]);
    expect([...start]).toEqual(["a"]);
  });
});

describe("selectRange", () => {
  it("selects from the anchor to the card, either way", () => {
    expect([...selectRange(new Set(["b"]), ORDER, "b", "e")].sort()).toEqual(["b", "c", "d", "e"]);
    expect([...selectRange(new Set(["e"]), ORDER, "e", "c")].sort()).toEqual(["c", "d", "e"]);
  });

  it("keeps what was picked outside the range", () => {
    expect([...selectRange(new Set(["a", "d"]), ORDER, "d", "f")].sort()).toEqual(["a", "d", "e", "f"]);
  });

  it("clears the range when the anchor was just unticked", () => {
    expect([...selectRange(new Set(["b", "c", "d", "f"]), ORDER, "a", "d")].sort()).toEqual(["f"]);
  });

  it("toggles one card when the anchor is gone", () => {
    expect([...selectRange(new Set(["b"]), ORDER, null, "d")].sort()).toEqual(["b", "d"]);
    expect([...selectRange(new Set(["b"]), ORDER, "zz", "b")]).toEqual([]);
    expect([...selectRange(new Set(), ORDER, "a", "zz")]).toEqual(["zz"]);
  });
});

describe("clickAction", () => {
  const keys = (k: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }>) => ({ ctrlKey: false, metaKey: false, shiftKey: false, ...k });

  it("toggles with Ctrl or Cmd", () => {
    expect(clickAction(keys({ ctrlKey: true }), false)).toBe("toggle");
    expect(clickAction(keys({ metaKey: true }), true)).toBe("toggle");
  });

  it("extends with Shift once something is selected, else opens", () => {
    expect(clickAction(keys({ shiftKey: true }), true)).toBe("range");
    expect(clickAction(keys({ shiftKey: true }), false)).toBe("open");
    expect(clickAction(keys({}), true)).toBe("open");
  });
});

describe("moveFocus", () => {
  // 10 cards, 4 columns: rows 0-3, 4-7 and 8-9.
  const move = (index: number, key: string) => moveFocus(index, key, 4, 10);

  it("moves left and right, stopping at the ends", () => {
    expect(move(0, "ArrowRight")).toBe(1);
    expect(move(3, "ArrowRight")).toBe(4);
    expect(move(9, "ArrowRight")).toBe(9);
    expect(move(4, "ArrowLeft")).toBe(3);
    expect(move(0, "ArrowLeft")).toBe(0);
  });

  it("moves up and down a row", () => {
    expect(move(1, "ArrowDown")).toBe(5);
    expect(move(5, "ArrowUp")).toBe(1);
    expect(move(2, "ArrowUp")).toBe(2);
  });

  it("goes to the last card when the row below is short", () => {
    expect(move(6, "ArrowDown")).toBe(9);
    expect(move(5, "ArrowDown")).toBe(9);
    expect(move(4, "ArrowDown")).toBe(8);
    expect(move(9, "ArrowDown")).toBe(9);
    expect(move(8, "ArrowDown")).toBe(8);
  });

  it("jumps to the ends and ignores other keys", () => {
    expect(move(5, "Home")).toBe(0);
    expect(move(5, "End")).toBe(9);
    expect(move(5, "a")).toBe(-1);
    expect(moveFocus(0, "ArrowDown", 4, 0)).toBe(-1);
  });

  it("treats a missing layout as one column", () => {
    expect(moveFocus(2, "ArrowDown", 0, 5)).toBe(3);
    expect(moveFocus(-1, "ArrowRight", 3, 5)).toBe(1);
  });
});

describe("columnsOf", () => {
  const box = (top: number, height = 150) => ({ top, height });

  it("counts the cards on the first row", () => {
    expect(columnsOf([box(10), box(10), box(10), box(180), box(180)])).toBe(3);
    expect(columnsOf([box(10), box(10.4), box(180)])).toBe(2);
    expect(columnsOf([box(10), box(10)])).toBe(2);
  });

  it("says one column with no cards or no layout", () => {
    expect(columnsOf([])).toBe(1);
    expect(columnsOf([box(0, 0), box(0, 0), box(0, 0)])).toBe(1);
  });
});
