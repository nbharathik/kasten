import { describe, expect, it } from "vitest";

import { applyChanges } from "./board-changes";
import { readCanvas, viewBoard } from "./memory-extras";

function board() {
  const canvas = readCanvas(
    JSON.stringify({
      nodes: [
        { id: "a", type: "text", text: "First", x: 0, y: 0, width: 260, height: 120 },
        { id: "b", type: "text", text: "Second", x: 400, y: 0, width: 260, height: 120 },
      ],
      edges: [],
    }),
  );
  return canvas;
}

describe("board changes in the preview", () => {
  it("places, adds and says the ids it made, like the core", () => {
    const canvas = board();
    const made = applyChanges(canvas, [
      { kind: "place", id: "a", x: 10, y: 20, width: 300 },
      { kind: "sticky", text: "Idea", x: 0, y: 200 },
      { kind: "card", path: "library/zettel.md", x: 400, y: 200 },
      { kind: "link", url: "https://jsoncanvas.org", x: 800, y: 200 },
      { kind: "section", label: "Later", x: -40, y: 160, width: 900, height: 300 },
    ]);
    expect(made).toHaveLength(4);
    expect(canvas.nodes.find((n) => n.id === "a")).toMatchObject({ x: 10, y: 20, width: 300, height: 120 });
    expect(canvas.nodes[0]).toMatchObject({ id: made[3], type: "group", label: "Later" });
    expect(canvas.nodes.find((n) => n.id === made[1])).toMatchObject({ type: "file", width: 320, height: 180 });
    expect(applyChanges(canvas, [{ kind: "card", path: "library/zettel.md", x: 0, y: 0 }])).toEqual([made[1]]);
  });

  it("connects facing sides or the ones given, and styles edges", () => {
    const canvas = board();
    const [edge] = applyChanges(canvas, [{ kind: "connect", from: "a", to: "b", label: "leads to" }]);
    expect(canvas.edges[0]).toEqual({ id: edge, fromNode: "a", fromSide: "right", toNode: "b", toSide: "left", label: "leads to" });
    applyChanges(canvas, [
      { kind: "edge", id: edge!, label: "", color: "#e8590c", fromEnd: "arrow" },
      { kind: "color", ids: ["a"], color: "4" },
    ]);
    const view = viewBoard("library/plan.canvas", canvas, []);
    expect(view.edges[0]).toEqual({ id: edge, from: "a", to: "b", color: "#e8590c", fromSide: "right", toSide: "left", fromEnd: "arrow" });
    expect(view.nodes[0]!.color).toBe("4");
    // Joined already, with the same (now no) label: the edge is reused.
    expect(applyChanges(canvas, [{ kind: "connect", from: "b", to: "a" }])).toEqual([edge]);
    const [other] = applyChanges(canvas, [{ kind: "connect", from: "b", to: "a", label: "back", fromSide: "bottom", toSide: "bottom" }]);
    expect(canvas.edges[1]).toMatchObject({ id: other, fromSide: "bottom", toSide: "bottom", label: "back" });
    // A layout moves an edge's sides, or leaves them to the view.
    applyChanges(canvas, [{ kind: "edge", id: other!, fromSide: "right", toSide: "" }]);
    expect(canvas.edges[1]).toMatchObject({ fromSide: "right" });
    expect(canvas.edges[1]!.toSide).toBeUndefined();
    expect(() => applyChanges(canvas, [{ kind: "edge", id: other!, fromSide: "middle" as "top" }])).toThrow(/side/);
  });

  it("refuses a bad batch whole, and removing what is gone is no change", () => {
    const canvas = board();
    const before = JSON.stringify(canvas);
    expect(() => applyChanges(canvas, [{ kind: "place", id: "a", x: 1, y: 1 }, { kind: "place", id: "nope", x: 1, y: 1 }])).toThrow(/nope/);
    expect(() => applyChanges(canvas, [{ kind: "link", url: "javascript:alert(1)", x: 0, y: 0 }])).toThrow(/web address/);
    expect(() => applyChanges(canvas, [{ kind: "color", ids: ["a"], color: "purple" }])).toThrow(/colour/);
    expect(JSON.stringify(canvas)).toBe(before);
    applyChanges(canvas, [{ kind: "remove", ids: ["gone"] }, { kind: "unlink", ids: ["gone"] }]);
    expect(JSON.stringify(canvas)).toBe(before);
    applyChanges(canvas, [{ kind: "connect", from: "a", to: "b" }]);
    applyChanges(canvas, [{ kind: "remove", ids: ["a"] }]);
    expect(canvas.nodes.map((n) => n.id)).toEqual(["b"]);
    expect(canvas.edges).toEqual([]);
  });

  it("writes text by kind: stickies, section labels and link addresses", () => {
    const canvas = board();
    const [section] = applyChanges(canvas, [{ kind: "wrap", ids: ["a", "b"], label: "Both" }]);
    applyChanges(canvas, [
      { kind: "text", id: "a", text: "Edited" },
      { kind: "text", id: section!, text: "Renamed" },
    ]);
    expect(canvas.nodes.find((n) => n.id === "a")!.text).toBe("Edited");
    expect(canvas.nodes.find((n) => n.id === section)!.label).toBe("Renamed");
    const [card] = applyChanges(canvas, [{ kind: "card", path: "library/zettel.md", x: 0, y: 400 }]);
    expect(() => applyChanges(canvas, [{ kind: "text", id: card!, text: "No" }])).toThrow(/note/);
  });
});

describe("board extras in the preview", () => {
  it("folds sections, sizes cards and forgets both when they go", () => {
    const canvas = board();
    const [card] = applyChanges(canvas, [{ kind: "card", path: "library/zettel.md", x: 0, y: 400 }]);
    const [section] = applyChanges(canvas, [{ kind: "wrap", ids: ["a"], label: "Now" }]);
    applyChanges(canvas, [
      { kind: "card_size", id: card!, size: "expanded" },
      { kind: "collapse", id: section!, collapsed: true },
      { kind: "collapse", id: section!, collapsed: true },
    ]);
    expect(canvas["x-kasten"]).toEqual({ cardSize: { [card!]: "expanded" }, collapsed: [section] });
    const view = viewBoard("library/plan.canvas", canvas, []);
    expect(view.nodes.find((n) => n.id === card)!.size).toBe("expanded");
    expect(view.nodes.find((n) => n.id === section)!.collapsed).toBe(true);
    expect(() => applyChanges(canvas, [{ kind: "card_size", id: "a", size: "title" }])).toThrow(/card/);
    expect(() => applyChanges(canvas, [{ kind: "collapse", id: "a", collapsed: true }])).toThrow(/section/);
    applyChanges(canvas, [{ kind: "remove", ids: [card!, section!] }]);
    expect(canvas["x-kasten"]).toEqual({ cardSize: {}, collapsed: [] });
  });

  it("puts back what was removed, ids and all", () => {
    const canvas = board();
    const [edge] = applyChanges(canvas, [{ kind: "connect", from: "a", to: "b" }]);
    const nodes = canvas.nodes.filter((n) => n.id === "b");
    const edges = [...canvas.edges];
    applyChanges(canvas, [{ kind: "remove", ids: ["b"] }]);
    applyChanges(canvas, [{ kind: "restore", nodes, edges }]);
    expect(canvas.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(canvas.edges.map((e) => e.id)).toEqual([edge]);
    expect(() => applyChanges(canvas, [{ kind: "restore", nodes, edges: [] }])).toThrow(/already/);
    expect(() => applyChanges(canvas, [{ kind: "restore", nodes: [], edges: [{ id: "e9", fromNode: "a", toNode: "gone" }] }])).toThrow(/gone/);
  });

  it("restores sections in their stacking order", () => {
    const canvas = board();
    const [outer] = applyChanges(canvas, [{ kind: "wrap", ids: ["a"], label: "Outer" }]);
    const [inner] = applyChanges(canvas, [{ kind: "wrap", ids: ["a"], label: "Inner" }]);
    const order = canvas.nodes.map((n) => n.id);
    const nodes = canvas.nodes.filter((n) => n.id === outer || n.id === inner);
    applyChanges(canvas, [{ kind: "remove", ids: [outer!, inner!] }]);
    applyChanges(canvas, [{ kind: "restore", nodes, edges: [] }]);
    expect(canvas.nodes.map((n) => n.id)).toEqual(order);
  });
});
