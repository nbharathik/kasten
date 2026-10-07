import { describe, expect, it } from "vitest";

import type { BoardChange } from "../../../../lib/vault/types";
import { applyChanges as coreApply } from "../../../workspace/preview/board-changes";
import { readCanvas, viewBoard } from "../../../workspace/preview/memory-extras";
import { applyChanges, madeByIndex, type BoardDoc } from "./apply";

const CANVAS = {
  nodes: [
    { id: "g", type: "group", label: "Ideas", x: -40, y: -80, width: 800, height: 400 },
    { id: "a", type: "text", text: "First", x: 0, y: 0, width: 260, height: 120 },
    { id: "b", type: "text", text: "Second", x: 400, y: 0, width: 260, height: 120, color: "2" },
    { id: "c", type: "file", file: "library/zettel.md", x: 0, y: 400, width: 320, height: 180 },
    { id: "l", type: "link", url: "https://jsoncanvas.org", x: 400, y: 400, width: 320, height: 180 },
  ],
  edges: [{ id: "e", fromNode: "a", fromSide: "right", toNode: "b", toSide: "left", label: "then" }],
  "x-kasten": { cardSize: { c: "title" }, collapsed: [] },
};

/** The board as the core's view has it, after `changes`, and the ids made. */
function core(changes: BoardChange[]) {
  const canvas = readCanvas(JSON.stringify(CANVAS));
  const made = coreApply(canvas, changes);
  return { made, view: viewBoard("library/b.canvas", canvas, []) };
}

const start = (): BoardDoc => core([]).view;

/** Order-free: nodes and edges by id. */
const byId = (doc: BoardDoc) => ({
  nodes: Object.fromEntries(doc.nodes.map((n) => [n.id, { ...n, title: undefined, missing: undefined }])),
  edges: Object.fromEntries(doc.edges.map((e) => [e.id, e])),
});

/** Applies in the window what the core applied, and checks both agree. */
function agrees(changes: BoardChange[]) {
  const { made, view } = core(changes);
  const local = applyChanges(start(), changes, made);
  expect(byId(local)).toEqual(byId(view));
  return { local, view, made };
}

describe("board changes applied in the window", () => {
  it("places, resizes and writes like the core", () => {
    agrees([
      { kind: "place", id: "a", x: 10.4, y: 20.6 },
      { kind: "place", id: "b", x: 500, y: 0, width: 300 },
      { kind: "text", id: "a", text: "Changed" },
      { kind: "text", id: "g", text: "  " },
      { kind: "text", id: "l", text: " https://kasten.app " },
    ]);
  });

  it("colours nodes and edges, and clears them", () => {
    agrees([
      { kind: "color", ids: ["a", "e"], color: "4" },
      { kind: "color", ids: ["b"], color: null },
    ]);
  });

  it("removes nodes with their edges, and skips ones already gone", () => {
    const { local } = agrees([{ kind: "remove", ids: ["a", "gone"] }]);
    expect(local.edges).toEqual([]);
  });

  it("makes stickies, cards, links and sections with the core's ids", () => {
    const { local, made } = agrees([
      { kind: "sticky", text: "Idea", x: 0, y: 700 },
      { kind: "card", path: "library/other.md", x: 400, y: 700 },
      { kind: "card", path: "library/zettel.md", x: 9, y: 9 },
      { kind: "link", url: "https://example.com", x: 800, y: 700 },
      { kind: "section", label: "Later", x: -40, y: 620, width: 1200, height: 400 },
    ]);
    expect(made[2]).toBe("c");
    expect(local.nodes[0]!.id).toBe(made[4]);
  });

  it("wraps and connects, reusing an edge that already joins two nodes", () => {
    const { made } = agrees([
      { kind: "wrap", ids: ["a", "b"], label: "Pair" },
      { kind: "connect", from: "b", to: "a", label: "then" },
      { kind: "connect", from: "a", to: "c", fromSide: "bottom" },
    ]);
    expect(made[1]).toBe("e");
  });

  it("styles edges, unlinks them, sizes cards and folds sections", () => {
    agrees([
      { kind: "edge", id: "e", label: "", color: "#e8590c", fromEnd: "arrow", toEnd: "none" },
      { kind: "card_size", id: "c", size: "expanded" },
      { kind: "collapse", id: "g", collapsed: true },
    ]);
    agrees([{ kind: "unlink", ids: ["e", "nope"] }, { kind: "card_size", id: "c", size: null }]);
    agrees([{ kind: "edge", id: "e", fromSide: "right", toSide: "" }]);
  });

  it("puts back removed nodes and edges, sections at the back", () => {
    const removed = core([{ kind: "remove", ids: ["g", "a"] }]).view;
    const restore: BoardChange = {
      kind: "restore",
      nodes: [CANVAS.nodes[0]!, CANVAS.nodes[1]!],
      edges: [CANVAS.edges[0]!],
    };
    const canvas = readCanvas(JSON.stringify(CANVAS));
    coreApply(canvas, [{ kind: "remove", ids: ["g", "a"] }, restore]);
    const local = applyChanges(removed, [restore]);
    expect(byId(local)).toEqual(byId(viewBoard("library/b.canvas", canvas, [])));
    expect(local.nodes[0]!.id).toBe("g");
  });

  it("skips what makes something until the core has said its id", () => {
    const doc = start();
    const local = applyChanges(doc, [{ kind: "sticky", text: "Soon", x: 0, y: 0 }, { kind: "place", id: "a", x: 5, y: 5 }]);
    expect(local.nodes).toHaveLength(doc.nodes.length);
    expect(local.nodes.find((n) => n.id === "a")).toMatchObject({ x: 5, y: 5 });
  });

  it("keeps every untouched node and edge as it was", () => {
    const doc = start();
    const local = applyChanges(doc, [{ kind: "place", id: "a", x: 1, y: 1 }]);
    expect(local.nodes.filter((n, i) => n === doc.nodes[i]).map((n) => n.id)).toEqual(["g", "b", "c", "l"]);
    expect(local.edges).toBe(doc.edges);
  });

  it("numbers the ids of what a batch made by change", () => {
    const changes: BoardChange[] = [
      { kind: "place", id: "a", x: 0, y: 0 },
      { kind: "sticky", text: "", x: 0, y: 0 },
      { kind: "remove", ids: [] },
      { kind: "connect", from: "a", to: "b" },
    ];
    expect(madeByIndex(changes, ["s", "e"])).toEqual([undefined, "s", undefined, "e"]);
  });
});

describe("shapes, drawings and line styles applied in the window", () => {
  it("makes shapes and drawings, reshapes, and styles lines like the core", () => {
    const { made } = agrees([
      { kind: "shape", shape: "diamond", text: "Ship it?", x: 0, y: 700, width: 160, height: 90 },
      { kind: "draw", points: "0,0 10,4", x: 300, y: 700, width: 10, height: 4, size: 3, color: "4" },
      { kind: "reshape", id: "a", shape: "hexagon" },
      { kind: "line", id: "e", line: "elbow", dash: true },
    ]);
    expect(made).toHaveLength(2);
    agrees([
      { kind: "reshape", id: "a", shape: "hexagon" },
      { kind: "reshape", id: "a", shape: "" },
      { kind: "line", id: "e", line: "curve", dash: true },
      { kind: "line", id: "e", line: "", dash: false },
    ]);
  });
});
