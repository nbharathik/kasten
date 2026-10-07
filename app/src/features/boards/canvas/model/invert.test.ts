import { describe, expect, it } from "vitest";

import type { BoardChange } from "../../../../lib/vault/types";
import { applyChanges as coreApply } from "../../../workspace/preview/board-changes";
import { readCanvas, viewBoard, type Canvas } from "../../../workspace/preview/memory-extras";
import type { BoardDoc } from "./apply";
import { invert } from "./invert";

const CANVAS = {
  nodes: [
    { id: "g", type: "group", label: "Ideas", x: -40, y: -80, width: 800, height: 400, color: "5" },
    { id: "a", type: "text", text: "First", x: 0, y: 0, width: 260, height: 120 },
    { id: "b", type: "text", text: "Second", x: 400, y: 0, width: 260, height: 120, color: "2" },
    { id: "c", type: "file", file: "library/zettel.md", x: 0, y: 400, width: 320, height: 180 },
    { id: "l", type: "link", url: "https://jsoncanvas.org", x: 400, y: 400, width: 320, height: 180 },
  ],
  edges: [
    { id: "e", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left", label: "then", toEnd: "none" },
    { id: "f", fromNode: "c", fromSide: "right", toNode: "l", toSide: "left" },
  ],
  "x-kasten": { cardSize: { c: "title" }, collapsed: ["g"] },
};

const view = (canvas: Canvas): BoardDoc => viewBoard("library/b.canvas", canvas, []);

/** Order-free, as undo may put a node back higher up than it was. */
const byId = (doc: BoardDoc) => ({
  nodes: Object.fromEntries(doc.nodes.map((n) => [n.id, n])),
  edges: Object.fromEntries(doc.edges.map((e) => [e.id, e])),
});

/** Runs `changes` through the core's rules, then their inverse; the board
 * must be as it was. Returns the inverse. */
function roundTrip(changes: BoardChange[]): BoardChange[] {
  const canvas = readCanvas(JSON.stringify(CANVAS));
  const before = view(canvas);
  const made = coreApply(canvas, changes);
  const back = invert(before, changes, made);
  coreApply(canvas, back);
  expect(byId(view(canvas))).toEqual(byId(before));
  return back;
}

describe("undoing board batches", () => {
  it("puts things back where they were", () => {
    const back = roundTrip([
      { kind: "place", id: "a", x: 100, y: 100 },
      { kind: "place", id: "a", x: 200, y: 200, width: 400, height: 300 },
    ]);
    expect(back).toEqual([
      { kind: "place", id: "a", x: 100, y: 100, width: 260, height: 120 },
      { kind: "place", id: "a", x: 0, y: 0 },
    ]);
  });

  it("brings removed nodes back with their edges, card sizes and folds", () => {
    const back = roundTrip([{ kind: "remove", ids: ["g", "a", "c", "missing"] }]);
    expect(back[0]).toMatchObject({ kind: "restore" });
    expect(back).toContainEqual({ kind: "card_size", id: "c", size: "title" });
    expect(back).toContainEqual({ kind: "collapse", id: "g", collapsed: true });
  });

  it("takes away what a batch made, but not what it found there", () => {
    const back = roundTrip([
      { kind: "sticky", text: "New", x: 0, y: 900 },
      { kind: "card", path: "library/zettel.md", x: 0, y: 0 },
      { kind: "card", path: "library/other.md", x: 0, y: 0 },
      { kind: "link", url: "https://example.com", x: 0, y: 0 },
      { kind: "section", label: "S", x: 0, y: 0, width: 100, height: 100 },
      { kind: "wrap", ids: ["a"], label: "Wrapped" },
      { kind: "connect", from: "a", to: "b", label: "then" },
      { kind: "connect", from: "b", to: "c" },
    ]);
    expect(back.filter((c) => c.kind === "remove")).toHaveLength(5);
    expect(back.filter((c) => c.kind === "unlink")).toHaveLength(1);
  });

  it("sets text, labels, addresses and colours back", () => {
    roundTrip([
      { kind: "text", id: "a", text: "Changed" },
      { kind: "text", id: "g", text: "" },
      { kind: "text", id: "l", text: "https://kasten.app" },
      { kind: "color", ids: ["a", "b", "g", "e"], color: "#112233" },
    ]);
  });

  it("restyles edges back and brings unlinked ones back", () => {
    roundTrip([
      { kind: "edge", id: "e", label: "", color: "3", fromEnd: "arrow", toEnd: "" },
      { kind: "edge", id: "f", label: "because" },
    ]);
    roundTrip([{ kind: "edge", id: "e", fromSide: "left", toSide: "" }]);
    roundTrip([{ kind: "unlink", ids: ["e", "f"] }]);
  });

  it("undoes sizes, folds and a restore", () => {
    roundTrip([
      { kind: "card_size", id: "c", size: "expanded" },
      { kind: "collapse", id: "g", collapsed: false },
    ]);
    const canvas = readCanvas(JSON.stringify(CANVAS));
    coreApply(canvas, [{ kind: "remove", ids: ["a"] }, { kind: "unlink", ids: ["f"] }]);
    const before = view(canvas);
    const restore: BoardChange = { kind: "restore", nodes: [CANVAS.nodes[1]!], edges: [CANVAS.edges[0]!, CANVAS.edges[1]!] };
    coreApply(canvas, [restore]);
    const back = invert(before, [restore], []);
    expect(back).toEqual([
      { kind: "unlink", ids: ["f"] },
      { kind: "remove", ids: ["a"] },
    ]);
    coreApply(canvas, back);
    expect(byId(view(canvas))).toEqual(byId(before));
  });

  it("redoes an undo: the inverse of the inverse", () => {
    const canvas = readCanvas(JSON.stringify(CANVAS));
    const original = view(canvas);
    const changes: BoardChange[] = [{ kind: "remove", ids: ["b"] }, { kind: "place", id: "a", x: 50, y: 50 }];
    const made = coreApply(canvas, changes);
    const after = view(canvas);
    const undo = invert(original, changes, made);
    coreApply(canvas, undo);
    expect(byId(view(canvas))).toEqual(byId(original));
    const redo = invert(after, undo, []);
    coreApply(canvas, redo);
    expect(byId(view(canvas))).toEqual(byId(after));
  });
});

describe("undo for shapes, drawings and line styles", () => {
  it("takes back a new shape or drawing, a new outline and a new line", () => {
    roundTrip([
      { kind: "shape", shape: "diamond", text: "Ship it?", x: 0, y: 700, width: 160, height: 90 },
      { kind: "draw", points: "0,0 10,4 20,10", x: 300, y: 700, width: 20, height: 10, size: 3, color: "4" },
    ]);
    roundTrip([{ kind: "reshape", id: "a", shape: "ellipse" }]);
    roundTrip([{ kind: "line", id: "e", line: "elbow", dash: true }]);
  });

  it("puts back a removed shape with its outline and its styled edges", () => {
    const canvas = readCanvas(JSON.stringify(CANVAS));
    coreApply(canvas, [
      { kind: "reshape", id: "a", shape: "cylinder" },
      { kind: "line", id: "e", line: "straight", dash: true },
    ]);
    const before = view(canvas);
    const changes: BoardChange[] = [{ kind: "remove", ids: ["a"] }];
    const made = coreApply(canvas, changes);
    coreApply(canvas, invert(before, changes, made));
    const after = view(canvas);
    expect(after.nodes.find((n) => n.id === "a")?.shape).toBe("cylinder");
    expect(after.edges.find((e) => e.id === "e")).toMatchObject({ line: "straight", dash: true });
  });
});
