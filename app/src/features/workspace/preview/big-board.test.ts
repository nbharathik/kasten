import { describe, expect, it } from "vitest";

import { BIG_BOARD, bigBoard, bigBoardSize } from "./big-board";
import { MemoryVault } from "./memory-vault";

describe("the synthetic board for speed checks", () => {
  it("has the nodes asked for, a note for every card and edges between real nodes", async () => {
    const files = bigBoard(500);
    const vault = new MemoryVault(files);
    const board = await vault.board(BIG_BOARD);
    expect(board.nodes).toHaveLength(500);
    expect(board.nodes.filter((n) => n.kind === "file" && n.missing)).toEqual([]);
    const ids = new Set(board.nodes.map((n) => n.id));
    expect(board.edges.length).toBeGreaterThan(200);
    expect(board.edges.every((e) => ids.has(e.from) && ids.has(e.to))).toBe(true);
    expect(board.nodes.filter((n) => n.kind === "group").length).toBeGreaterThan(30);
    expect(board.nodes.some((n) => n.size === "expanded")).toBe(true);
    expect(bigBoard(500)).toEqual(files);
  });

  it("reads its size from the address", () => {
    expect(bigBoardSize("?board=500")).toBe(500);
    expect(bigBoardSize("?big=10")).toBe(0);
    expect(bigBoardSize("?board=99999")).toBe(5000);
  });
});
