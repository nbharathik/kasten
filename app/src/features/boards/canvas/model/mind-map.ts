// Mind-map mode: what is joined to a root, laid
// out as a tree from left to right. Children keep their order from top to
// bottom, each branch centres on its children, and edges join the sides
// that then face each other. Growing one: a new child goes right of its
// parent, below the children it has. Sections take no part.

import type { BoardChange, BoardEdge, BoardNode, BoardSide } from "../../../../lib/vault/types";
import { STICKY, bottom, centre, shownRect, type Rect } from "./geometry";

/** Across from a node to its children, and down between siblings. */
export const ACROSS = 96;
export const DOWN = 24;

interface Branch {
  id: string;
  /** The edge from its parent; none for the root. */
  edge: BoardEdge | null;
  children: Branch[];
}

const joins = (edge: BoardEdge, id: string) => edge.from === id || edge.to === id;
const other = (edge: BoardEdge, id: string) => (edge.from === id ? edge.to : edge.from);

/** The tree hanging from `root` over `pool`: every node joined to it,
 * reached once, nearest first; children in their order down the board. */
function treeFrom(root: string, pool: Map<string, BoardNode>, edges: readonly BoardEdge[]): Branch {
  const top: Branch = { id: root, edge: null, children: [] };
  const seen = new Set([root]);
  const queue = [top];
  for (let i = 0; i < queue.length; i++) {
    const branch = queue[i]!;
    const next = edges
      .filter((e) => joins(e, branch.id) && pool.has(other(e, branch.id)) && !seen.has(other(e, branch.id)))
      .map((e) => ({ edge: e, node: pool.get(other(e, branch.id))! }))
      .sort((a, b) => a.node.y - b.node.y || a.node.x - b.node.x);
    for (const { edge, node } of next) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const child: Branch = { id: node.id, edge, children: [] };
      branch.children.push(child);
      queue.push(child);
    }
  }
  return top;
}

/** Groups of nodes joined to each other, two or more strong. */
function joined(pool: Map<string, BoardNode>, edges: readonly BoardEdge[]): string[][] {
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of pool.keys()) {
    if (seen.has(id)) continue;
    const group = [id];
    seen.add(id);
    for (let i = 0; i < group.length; i++) {
      for (const e of edges) {
        if (!joins(e, group[i]!)) continue;
        const next = other(e, group[i]!);
        if (pool.has(next) && !seen.has(next)) {
          seen.add(next);
          group.push(next);
        }
      }
    }
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

/** A group's root: what nothing points at, pointing at the most, then the
 * leftmost. */
function rootOf(group: string[], pool: Map<string, BoardNode>, edges: readonly BoardEdge[]): string {
  const inside = new Set(group);
  const count = (id: string, end: "from" | "to") => edges.filter((e) => e[end] === id && inside.has(e.from) && inside.has(e.to)).length;
  const ranked = [...group].sort((a, b) => {
    const na = pool.get(a)!;
    const nb = pool.get(b)!;
    return count(a, "to") - count(b, "to") || count(b, "from") - count(a, "from") || na.x - nb.x || na.y - nb.y;
  });
  return ranked[0]!;
}

/** Places a tree with its root where it is, and joins its edges' facing sides. */
function layTree(tree: Branch, pool: Map<string, BoardNode>, edges: readonly BoardEdge[]): BoardChange[] {
  const rect = (id: string) => shownRect(pool.get(id)!);
  // Each depth's column starts after the widest node of the one before.
  const widths: number[] = [];
  const spans = new Map<string, number>();
  const measure = (b: Branch, depth: number): number => {
    widths[depth] = Math.max(widths[depth] ?? 0, rect(b.id).width);
    const block = b.children.reduce((sum, c) => sum + measure(c, depth + 1), 0) + DOWN * Math.max(0, b.children.length - 1);
    const span = Math.max(rect(b.id).height, block);
    spans.set(b.id, span);
    return span;
  };
  const root = rect(tree.id);
  const rootSpan = measure(tree, 0);
  const columns = [root.x];
  for (let d = 1; d < widths.length; d++) columns[d] = columns[d - 1]! + widths[d - 1]! + ACROSS;

  const changes: BoardChange[] = [];
  const inTree = new Set<string>();
  const place = (b: Branch, depth: number, top: number) => {
    inTree.add(b.id);
    const span = spans.get(b.id)!;
    const r = rect(b.id);
    const x = Math.round(columns[depth]!);
    const y = Math.round(top + (span - r.height) / 2);
    if (x !== r.x || y !== r.y) changes.push({ kind: "place", id: b.id, x, y });
    const block = b.children.reduce((sum, c) => sum + spans.get(c.id)!, 0) + DOWN * Math.max(0, b.children.length - 1);
    let childTop = top + (span - block) / 2;
    for (const child of b.children) {
      place(child, depth + 1, childTop);
      childTop += spans.get(child.id)! + DOWN;
      // Parent on the left, child on the right, whichever way it was drawn.
      const edge = child.edge!;
      const [fromSide, toSide]: [BoardSide, BoardSide] = edge.from === b.id ? ["right", "left"] : ["left", "right"];
      if (edge.fromSide !== fromSide || edge.toSide !== toSide) changes.push({ kind: "edge", id: edge.id, fromSide, toSide });
    }
  };
  place(tree, 0, root.y + root.height / 2 - rootSpan / 2);
  // Edges the tree does not follow go between the sides the view picks.
  const followed = new Set<string>();
  const walk = (b: Branch) => {
    if (b.edge) followed.add(b.edge.id);
    b.children.forEach(walk);
  };
  walk(tree);
  for (const e of edges) {
    if (followed.has(e.id) || !inTree.has(e.from) || !inTree.has(e.to) || (!e.fromSide && !e.toSide)) continue;
    changes.push({ kind: "edge", id: e.id, fromSide: "", toSide: "" });
  }
  return changes;
}

/** The mind-map layout. One node chosen: the tree of everything joined to
 * it. Several, or all: each joined group among them from its own root. */
export function mindMap(nodes: readonly BoardNode[], edges: readonly BoardEdge[], chosen: readonly BoardNode[]): BoardChange[] {
  const usable = (list: readonly BoardNode[]) => new Map(list.filter((n) => n.kind !== "group").map((n) => [n.id, n]));
  if (chosen.length === 1) {
    const pool = usable(nodes);
    if (!pool.has(chosen[0]!.id)) return [];
    const tree = treeFrom(chosen[0]!.id, pool, edges);
    return tree.children.length ? layTree(tree, pool, edges) : [];
  }
  const pool = usable(chosen);
  return joined(pool, edges).flatMap((group) => layTree(treeFrom(rootOf(group, pool, edges), pool, edges), pool, edges));
}

/** The nodes joined to `id` on the given side of its centre. */
function joinedOn(nodes: readonly BoardNode[], edges: readonly BoardEdge[], id: string, side: "left" | "right"): BoardNode[] {
  const node = nodes.find((n) => n.id === id);
  if (!node) return [];
  const mid = centre(shownRect(node)).x;
  return edges
    .filter((e) => joins(e, id))
    .map((e) => nodes.find((n) => n.id === other(e, id)))
    .filter((n): n is BoardNode => Boolean(n && n.kind !== "group" && (side === "right" ? centre(shownRect(n)).x > mid : centre(shownRect(n)).x < mid)));
}

/** A node's parent in a mind map: the nearest node joined to it on its left. */
export function parentOf(nodes: readonly BoardNode[], edges: readonly BoardEdge[], id: string): string | null {
  const node = nodes.find((n) => n.id === id);
  if (!node) return null;
  const here = centre(shownRect(node));
  const dist = (n: BoardNode) => Math.hypot(centre(shownRect(n)).x - here.x, centre(shownRect(n)).y - here.y);
  const left = joinedOn(nodes, edges, id, "left").sort((a, b) => dist(a) - dist(b));
  return left[0]?.id ?? null;
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Where a new sticky child of `id` goes: in its children's column (or
 * across from it), below the lowest child, else level with it; and on
 * down past anything already there, such as another branch's children. */
export function childSpot(nodes: readonly BoardNode[], edges: readonly BoardEdge[], id: string): { x: number; y: number } {
  const parent = shownRect(nodes.find((n) => n.id === id)!);
  const children = joinedOn(nodes, edges, id, "right").map(shownRect);
  const spot =
    children.length === 0
      ? { x: parent.x + parent.width + ACROSS, y: Math.round(parent.y + parent.height / 2 - STICKY.height / 2) }
      : { x: Math.min(...children.map((c) => c.x)), y: Math.max(...children.map(bottom)) + DOWN };
  const others = nodes.filter((n) => n.kind !== "group").map(shownRect);
  for (let tries = 0; tries < others.length; tries++) {
    const hit = others.find((r) => overlap({ ...spot, ...STICKY }, r));
    if (!hit) break;
    spot.y = bottom(hit) + DOWN;
  }
  return spot;
}
