import { describe, expect, it } from "vitest";

import type { BoardEdge, BoardNode } from "../../../../lib/vault/types";
import { applyChanges } from "./apply";
import { ACROSS, DOWN, childSpot, mindMap, parentOf } from "./mind-map";

const card = (id: string, x: number, y: number): BoardNode => ({ id, kind: "file", file: `library/${id}.md`, x, y, width: 320, height: 180 });
const sticky = (id: string, x: number, y: number): BoardNode => ({ id, kind: "text", text: id, x, y, width: 260, height: 120 });
const section = (id: string, x: number, y: number): BoardNode => ({ id, kind: "group", label: id, x, y, width: 900, height: 700 });
const edge = (id: string, from: string, to: string, sides: Partial<BoardEdge> = {}): BoardEdge => ({ id, from, to, ...sides });

function laidOut(nodes: BoardNode[], edges: BoardEdge[], chosen: string[]) {
  const doc = { path: "library/b.canvas", title: "B", nodes, edges };
  const changes = mindMap(nodes, edges, nodes.filter((n) => chosen.includes(n.id)));
  const next = applyChanges(doc, changes);
  const at = (id: string) => {
    const n = next.nodes.find((m) => m.id === id)!;
    return [n.x, n.y];
  };
  const sides = (id: string) => {
    const e = next.edges.find((m) => m.id === id)!;
    return [e.fromSide ?? null, e.toSide ?? null];
  };
  return { changes, at, sides };
}

describe("mind map layout", () => {
  // A root card, two stickies joined to it (b drawn above a), a grandchild.
  const nodes = [card("r", 0, 0), sticky("a", 900, 700), sticky("b", 50, -400), sticky("c", -300, 300), section("s", 3000, 0), sticky("lone", 2000, 2000)];
  const edges = [edge("ra", "r", "a", { fromSide: "bottom", toSide: "top" }), edge("rb", "r", "b"), edge("ca", "c", "a", { fromSide: "top", toSide: "bottom" })];

  it("lays out what is joined to the root as a tree, left to right, the root staying put", () => {
    const { at } = laidOut(nodes, edges, ["r"]);
    expect(at("r")).toEqual([0, 0]);
    const column1 = 320 + ACROSS;
    const column2 = column1 + 260 + ACROSS;
    // Children keep their order from top to bottom: b was above a.
    const span = 120 + DOWN + 120;
    const top = 90 - span / 2;
    expect(at("b")).toEqual([column1, top]);
    expect(at("a")).toEqual([column1, top + 120 + DOWN]);
    // A child's children centre on it.
    expect(at("c")).toEqual([column2, top + 120 + DOWN]);
    // What is not joined, and sections, stay.
    expect(at("lone")).toEqual([2000, 2000]);
    expect(at("s")).toEqual([3000, 0]);
  });

  it("joins each edge by the sides that now face each other", () => {
    const { sides } = laidOut(nodes, edges, ["r"]);
    expect(sides("ra")).toEqual(["right", "left"]);
    expect(sides("rb")).toEqual(["right", "left"]);
    // Drawn from the child to its parent: it leaves by the child's left.
    expect(sides("ca")).toEqual(["left", "right"]);
  });

  it("places a node reached twice once, and leaves the extra edge to the view", () => {
    const loop = [...edges, edge("bc", "b", "c", { fromSide: "bottom", toSide: "top" })];
    const { at, sides } = laidOut(nodes, loop, ["r"]);
    expect(at("c")[0]).toBe(320 + ACROSS + 260 + ACROSS);
    const byB = sides("bc");
    const byA = sides("ca");
    // One of them carries c in the tree; the other lets the view pick.
    expect([byA, byB]).toContainEqual([null, null]);
  });

  it("with everything chosen (nothing selected), lays out each joined group from its own root", () => {
    const more = [...nodes, card("q", 0, 1500), sticky("d", 400, 1400)];
    const { at } = laidOut(more, [...edges, edge("qd", "q", "d")], more.map((n) => n.id));
    expect(at("r")).toEqual([0, 0]);
    expect(at("q")).toEqual([0, 1500]);
    expect(at("d")).toEqual([320 + ACROSS, 1500 + 90 - 60]);
    // The root is the node nothing points at.
    expect(at("c")[0]!).toBeGreaterThan(at("a")[0]!);
  });

  it("with several chosen, keeps to them", () => {
    const { at } = laidOut(nodes, edges, ["r", "b"]);
    expect(at("b")).toEqual([320 + ACROSS, 90 - 60]);
    expect(at("a")).toEqual([900, 700]);
  });

  it("does nothing without edges to follow", () => {
    expect(mindMap(nodes, [], nodes)).toEqual([]);
    expect(mindMap(nodes, edges, [nodes[5]!])).toEqual([]);
  });
});

describe("growing a mind map", () => {
  const nodes = [card("r", 0, 0), sticky("a", 416, -42), sticky("x", -600, 0)];
  const edges = [edge("ra", "r", "a"), edge("xr", "x", "r")];

  it("puts a new child right of its parent, below the children it has", () => {
    expect(childSpot(nodes, edges, "a")).toEqual({ x: 416 + 260 + ACROSS, y: -42 });
    expect(childSpot(nodes, edges, "r")).toEqual({ x: 320 + ACROSS, y: -42 + 120 + DOWN });
  });

  it("steps down past what is already there, such as another branch's children", () => {
    // Another branch's child sits where a's first child would go.
    const crowded = [...nodes, sticky("other", 416 + 260 + ACROSS, -42), sticky("below", 416 + 260 + ACROSS, 100)];
    expect(childSpot(crowded, edges, "a")).toEqual({ x: 416 + 260 + ACROSS, y: 100 + 120 + DOWN });
  });

  it("finds a node's parent: the node joined to it on its left", () => {
    expect(parentOf(nodes, edges, "a")).toBe("r");
    expect(parentOf(nodes, edges, "r")).toBe("x");
    expect(parentOf(nodes, edges, "x")).toBeNull();
  });
});
