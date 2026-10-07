import { describe, expect, it } from "vitest";

import type { BoardNode, BoardView } from "../../../../lib/vault/board-types";
import { reconcile } from "./reconcile";

const stroke: BoardNode = { id: "d1", kind: "text", x: 0, y: 0, width: 60, height: 20, draw: { points: "4,20 60,20", size: 4 } };
const sticky: BoardNode = { id: "s1", kind: "text", x: 0, y: 100, width: 200, height: 120, text: "A sticky" };
const board: BoardView = { path: "boards/b.canvas", title: "B", nodes: [stroke, sticky], edges: [] };

/** The same board as the core sends it again: every object new. */
const readAgain = (view: BoardView): BoardView => JSON.parse(JSON.stringify(view)) as BoardView;

describe("reconcile", () => {
  it("keeps the old board when a fresh read holds the same nodes, drawings too", () => {
    expect(reconcile(board, readAgain(board))).toBe(board);
  });

  it("keeps every node that did not change, and takes the one that did", () => {
    const next = readAgain(board);
    next.nodes[0]!.draw!.points = "4,20 90,20";
    const out = reconcile(board, next);
    expect(out.nodes[0]).toBe(next.nodes[0]);
    expect(out.nodes[1]).toBe(sticky);
  });
});
