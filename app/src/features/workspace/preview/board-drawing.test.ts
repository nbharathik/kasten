import { describe, expect, it } from "vitest";

import { applyChanges } from "./board-changes";
import { readCanvas, viewBoard } from "./memory-extras";

const empty = () => readCanvas(JSON.stringify({ nodes: [], edges: [] }));

describe("shapes, drawings and lines in the preview, as the core keeps them", () => {
  it("keeps a shape's outline and a drawing's points under x-kasten", () => {
    const canvas = empty();
    const [shape, drawn] = applyChanges(canvas, [
      { kind: "shape", shape: "diamond", text: "Ship it?", x: 0, y: 0, width: 160, height: 90 },
      { kind: "draw", points: "0,0 10,4", x: 100, y: 50, width: 20, height: 10, size: 3, color: "4" },
    ]);
    expect(canvas.nodes.find((n) => n.id === shape)).toMatchObject({ type: "text", text: "Ship it?" });
    expect(canvas.nodes.find((n) => n.id === drawn)).toMatchObject({ type: "text", text: "", color: "4" });
    const view = viewBoard("b.canvas", canvas, []);
    expect(view.nodes.find((n) => n.id === shape)?.shape).toBe("diamond");
    expect(view.nodes.find((n) => n.id === drawn)?.draw).toEqual({ points: "0,0 10,4", size: 3 });
    applyChanges(canvas, [{ kind: "reshape", id: shape!, shape: "" }]);
    expect(viewBoard("b.canvas", canvas, []).nodes.find((n) => n.id === shape)?.shape).toBeUndefined();
    applyChanges(canvas, [{ kind: "remove", ids: [drawn!] }]);
    expect((canvas["x-kasten"] as Record<string, Record<string, unknown>>).draw![drawn!]).toBeUndefined();
  });

  it("refuses what the core refuses", () => {
    const canvas = empty();
    expect(() => applyChanges(canvas, [{ kind: "shape", shape: "star" as never, text: "", x: 0, y: 0, width: 10, height: 10 }])).toThrow(/star/);
    expect(() => applyChanges(canvas, [{ kind: "draw", points: "1,2 3", x: 0, y: 0, width: 10, height: 10, size: 3 }])).toThrow(/points/);
    expect(() => applyChanges(canvas, [{ kind: "draw", points: "1,2", x: 0, y: 0, width: 10, height: 10, size: 99 }])).toThrow(/pen/);
    expect(canvas.nodes).toHaveLength(0);
  });

  it("styles lines, forgets them with their edge, and undo brings them back", () => {
    const canvas = empty();
    const [a, b] = applyChanges(canvas, [
      { kind: "shape", shape: "rect", text: "A", x: 0, y: 0, width: 160, height: 90 },
      { kind: "shape", shape: "rect", text: "B", x: 400, y: 0, width: 160, height: 90 },
    ]);
    const [edge] = applyChanges(canvas, [{ kind: "connect", from: a!, to: b! }]);
    applyChanges(canvas, [{ kind: "line", id: edge!, line: "elbow", dash: true }]);
    let view = viewBoard("b.canvas", canvas, []);
    expect(view.edges[0]).toMatchObject({ line: "elbow", dash: true });
    const rawA = { ...canvas.nodes.find((n) => n.id === a)! };
    const rawEdge = { ...canvas.edges[0]! };
    applyChanges(canvas, [{ kind: "remove", ids: [a!] }]);
    expect(canvas.edges).toHaveLength(0);
    applyChanges(canvas, [{ kind: "restore", nodes: [{ ...rawA, "x-kasten": { shape: "rect" } }], edges: [{ ...rawEdge, "x-kasten": { line: "elbow", dash: true } }] }]);
    view = viewBoard("b.canvas", canvas, []);
    expect(view.nodes.find((n) => n.id === a)?.shape).toBe("rect");
    expect(view.edges[0]).toMatchObject({ line: "elbow", dash: true });
    expect(canvas.nodes.find((n) => n.id === a)!["x-kasten"]).toBeUndefined();
  });
});
