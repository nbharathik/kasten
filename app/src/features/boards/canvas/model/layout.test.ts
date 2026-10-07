import { describe, expect, it } from "vitest";

import type { BoardChange, BoardNode } from "../../../../lib/vault/types";
import { applyChanges, type BoardDoc } from "./apply";
import { TITLE_HEIGHT, shownRect } from "./geometry";
import { UNTAGGED, align, clusterByTag, distribute, tidy } from "./layout";
import { dropGrid, freeSpot } from "./placement";
import { carried, contents, hiddenIds } from "./sections";

const card = (id: string, x: number, y: number, extra: Partial<BoardNode> = {}): BoardNode => ({ id, kind: "file", file: `library/${id}.md`, x, y, width: 320, height: 180, ...extra });
const sticky = (id: string, x: number, y: number, width = 260, height = 120): BoardNode => ({ id, kind: "text", text: id, x, y, width, height });
const section = (id: string, x: number, y: number, width: number, height: number, extra: Partial<BoardNode> = {}): BoardNode => ({ id, kind: "group", label: id, x, y, width, height, ...extra });

const doc = (nodes: BoardNode[]): BoardDoc => ({ path: "library/b.canvas", title: "B", nodes, edges: [] });
const after = (nodes: BoardNode[], changes: BoardChange[], made?: string[]) => applyChanges(doc(nodes), changes, made).nodes;
const at = (nodes: BoardNode[], id: string) => {
  const n = nodes.find((m) => m.id === id)!;
  return [n.x, n.y];
};

describe("what a section holds", () => {
  const nodes = [section("s", 0, 0, 1000, 600), section("inner", 40, 80, 400, 300), sticky("a", 60, 120), card("b", 600, 100), card("out", 1200, 0), card("edge", 900, 500)];

  it("holds what has its centre inside and is smaller", () => {
    expect(contents(nodes, nodes[0]!).map((n) => n.id)).toEqual(["inner", "a", "b"]);
    expect(contents(nodes, nodes[1]!).map((n) => n.id)).toEqual(["a"]);
    const huge = sticky("huge", 10, 10, 2000, 2000);
    expect(contents([...nodes, huge], nodes[1]!).map((n) => n.id)).not.toContain("huge");
  });

  it("hides what a folded section holds, and carries it when dragged", () => {
    const folded = nodes.map((n) => (n.id === "inner" ? { ...n, collapsed: true } : n));
    expect([...hiddenIds(folded)]).toEqual(["a"]);
    expect(carried(nodes, new Set(["s"])).sort()).toEqual(["a", "b", "inner"]);
    expect(carried(nodes, new Set(["s", "b"])).sort()).toEqual(["a", "inner"]);
  });

  it("measures title-only cards and folded sections by what shows", () => {
    expect(shownRect(card("t", 0, 0, { size: "title" })).height).toBe(TITLE_HEIGHT);
    expect(shownRect(section("f", 0, 0, 100, 500, { collapsed: true })).height).toBeLessThan(100);
  });
});

describe("layout helpers", () => {
  const row = [card("a", 0, 10), card("b", 400, 90), sticky("c", 900, 0)];

  it("aligns edges and centre lines in one batch", () => {
    expect(align(row, row, "top")).toEqual([{ kind: "place", id: "a", x: 0, y: 0 }, { kind: "place", id: "b", x: 400, y: 0 }]);
    const bottoms = after(row, align(row, row, "bottom")).map((n) => n.y + n.height);
    expect(new Set(bottoms).size).toBe(1);
    const middles = after(row, align(row, row, "middle")).map((n) => n.y + n.height / 2);
    expect(Math.max(...middles) - Math.min(...middles)).toBeLessThanOrEqual(1);
    expect(align(row, [row[0]!], "left")).toEqual([]);
  });

  it("distributes with even gaps, keeping the outermost where they are", () => {
    const spread = [sticky("a", 0, 0, 100), sticky("b", 150, 0, 100), sticky("c", 1000, 0, 100)];
    const moved = after(spread, distribute(spread, spread, "horizontal"));
    expect(moved.map((n) => n.x)).toEqual([0, 500, 1000]);
    expect(distribute(spread, spread.slice(0, 2), "vertical")).toEqual([]);
  });

  it("tidies into rows in reading order", () => {
    const loose = [card("a", 500, 300), card("b", 0, 0), card("c", 40, 700), card("d", 900, 10)];
    const moved = after(loose, tidy(loose, loose));
    expect(at(moved, "b")).toEqual([0, 0]);
    expect(at(moved, "d")).toEqual([360, 0]);
    expect(at(moved, "a")).toEqual([0, 220]);
    expect(at(moved, "c")).toEqual([360, 220]);
  });

  it("moves what is inside a section with it, and not on its own", () => {
    const nodes = [section("s", 0, 0, 500, 400), sticky("in", 40, 80), sticky("other", 0, 800)];
    const changes = align(nodes, nodes, "left");
    expect(changes).toEqual([]);
    const moved = after(nodes, align(nodes, [nodes[0]!, nodes[2]!], "bottom"));
    expect(at(moved, "s")).toEqual([0, 520]);
    expect(at(moved, "in")).toEqual([40, 600]);
  });

  it("clusters cards by first tag into sections, untagged last", () => {
    const cards = [card("x", 0, 0), card("y", 400, 0), card("z", 800, 0), sticky("s", -900, 400)];
    const tags: Record<string, string[]> = { "library/x.md": [], "library/y.md": ["paper", "idea"], "library/z.md": ["paper"] };
    const changes = clusterByTag(cards, (path) => tags[path] ?? []);
    const sections = changes.filter((c) => c.kind === "section");
    expect(sections.map((c) => (c as { label: string }).label)).toEqual(["paper", UNTAGGED]);
    const moved = after(cards, changes, ["p", "u"]);
    const paper = moved.find((n) => n.id === "p")!;
    const untagged = moved.find((n) => n.id === "u")!;
    expect(contents(moved, paper).map((n) => n.id).sort()).toEqual(["y", "z"]);
    expect(contents(moved, untagged).map((n) => n.id)).toEqual(["x"]);
    expect(untagged.x).toBeGreaterThan(paper.x + paper.width);
    expect(at(moved, "s")).toEqual([-900, 400]);
  });
});

describe("placing new things", () => {
  it("centres one dropped card on the point and grids several", () => {
    expect(dropGrid({ x: 500, y: 500 }, 1)).toEqual([{ x: 340, y: 410 }]);
    const four = dropGrid({ x: 0, y: 0 }, 4);
    expect(four.map((p) => [p.x, p.y])).toEqual([[-160, -90], [200, -90], [-160, 130], [200, 130]]);
    expect(new Set(dropGrid({ x: 0, y: 0 }, 9).map((p) => p.x)).size).toBe(3);
  });

  it("steps aside from a node already at the spot", () => {
    const nodes = [sticky("a", 100, 100), sticky("b", 124, 124)];
    expect(freeSpot(nodes, { x: 100, y: 100 })).toEqual({ x: 148, y: 148 });
    expect(freeSpot(nodes, { x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });
});
