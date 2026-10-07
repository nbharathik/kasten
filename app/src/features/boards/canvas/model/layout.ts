// Layout helpers: align, distribute, tidy into a
// grid and cluster by tag. Each gives the changes for one batch, so each is
// one step to undo. A section that moves carries what is inside it, and
// nodes inside a section that is laid out stay put inside it.

import type { BoardChange, BoardNode } from "../../../../lib/vault/types";
import { GAP, PAD, bounds, bottom, holds, rectOf, right, sectionAround, shownRect, type Rect } from "./geometry";
import { carried } from "./sections";

export type Alignment = "left" | "centre" | "right" | "top" | "middle" | "bottom";
export type Axis = "horizontal" | "vertical";

/** Where each node goes: its id and new top-left corner. */
type Moves = Map<string, { x: number; y: number }>;

/** The nodes to lay out: those not inside another one being laid out. */
function topLevel(nodes: readonly BoardNode[]): BoardNode[] {
  const groups = nodes.filter((n) => n.kind === "group");
  return nodes.filter((n) => !groups.some((g) => g.id !== n.id && holds(rectOf(g), shownRect(n))));
}

/** Place changes for `moves`, plus what moved sections carry, skipping
 * nodes that stay where they are. */
function placed(all: readonly BoardNode[], moves: Moves): BoardChange[] {
  const out: BoardChange[] = [];
  const done = new Set(moves.keys());
  for (const [id, to] of moves) {
    const node = all.find((n) => n.id === id);
    if (!node) continue;
    const dx = Math.round(to.x) - node.x;
    const dy = Math.round(to.y) - node.y;
    if (dx === 0 && dy === 0) continue;
    out.push({ kind: "place", id, x: node.x + dx, y: node.y + dy });
    if (node.kind !== "group") continue;
    for (const inner of carried(all, new Set([id]))) {
      if (done.has(inner)) continue;
      done.add(inner);
      const n = all.find((m) => m.id === inner)!;
      out.push({ kind: "place", id: inner, x: n.x + dx, y: n.y + dy });
    }
  }
  return out;
}

/** Lines the nodes up on the selection's edge or centre line. */
export function align(all: readonly BoardNode[], selected: readonly BoardNode[], how: Alignment): BoardChange[] {
  const items = topLevel(selected);
  const box = bounds(items.map(shownRect));
  if (!box || items.length < 2) return [];
  const moves: Moves = new Map();
  for (const node of items) {
    const r = shownRect(node);
    const to = { x: r.x, y: r.y };
    if (how === "left") to.x = box.x;
    if (how === "centre") to.x = box.x + (box.width - r.width) / 2;
    if (how === "right") to.x = right(box) - r.width;
    if (how === "top") to.y = box.y;
    if (how === "middle") to.y = box.y + (box.height - r.height) / 2;
    if (how === "bottom") to.y = bottom(box) - r.height;
    moves.set(node.id, to);
  }
  return placed(all, moves);
}

/** Even gaps between the nodes along an axis; the outermost two stay. */
export function distribute(all: readonly BoardNode[], selected: readonly BoardNode[], axis: Axis): BoardChange[] {
  const items = topLevel(selected);
  if (items.length < 3) return [];
  const horizontal = axis === "horizontal";
  const start = (r: Rect) => (horizontal ? r.x : r.y);
  const length = (r: Rect) => (horizontal ? r.width : r.height);
  const sorted = [...items].sort((a, b) => start(shownRect(a)) + length(shownRect(a)) / 2 - (start(shownRect(b)) + length(shownRect(b)) / 2));
  const first = shownRect(sorted[0]!);
  const last = shownRect(sorted[sorted.length - 1]!);
  const span = start(last) + length(last) - start(first);
  const used = sorted.reduce((sum, n) => sum + length(shownRect(n)), 0);
  const gap = (span - used) / (sorted.length - 1);
  const moves: Moves = new Map();
  let at = start(first);
  for (const node of sorted) {
    const r = shownRect(node);
    moves.set(node.id, horizontal ? { x: at, y: r.y } : { x: r.x, y: at });
    at += length(r) + gap;
  }
  return placed(all, moves);
}

/** Rows of nodes in reading order, as square as it gets, from the
 * selection's top-left corner. */
export function tidy(all: readonly BoardNode[], selected: readonly BoardNode[]): BoardChange[] {
  const items = topLevel(selected);
  const box = bounds(items.map(shownRect));
  if (!box || items.length < 2) return [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const columns = Math.ceil(Math.sqrt(sorted.length));
  const moves: Moves = new Map();
  let top = box.y;
  for (let row = 0; row * columns < sorted.length; row++) {
    const cells = sorted.slice(row * columns, (row + 1) * columns);
    let left = box.x;
    for (const node of cells) {
      moves.set(node.id, { x: left, y: top });
      left += shownRect(node).width + GAP;
    }
    top += Math.max(...cells.map((n) => shownRect(n).height)) + GAP;
  }
  return placed(all, moves);
}

/** The section for notes without tags, as the core names it. */
export const UNTAGGED = "Untagged";

/** A section per first tag, side by side from the cards' top-left corner,
 * each card in its tag's column (the core's `Layout::ClusterByTag`); cards
 * without tags go in "Untagged", last. Only cards for notes take part. */
export function clusterByTag(selected: readonly BoardNode[], tagsOf: (path: string) => readonly string[]): BoardChange[] {
  const cards = selected.filter((n) => n.kind === "file" && n.file?.endsWith(".md"));
  const box = bounds(cards.map(shownRect));
  if (!box) return [];
  const columns: [string, BoardNode[]][] = [];
  for (const card of [...cards].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const tag = tagsOf(card.file!).map((t) => t.trim()).find(Boolean) ?? UNTAGGED;
    const column = columns.find(([label]) => label === tag);
    if (column) column[1].push(card);
    else columns.push([tag, [card]]);
  }
  columns.sort(([a], [b]) => Number(a === UNTAGGED) - Number(b === UNTAGGED));
  const sections: BoardChange[] = [];
  const moves: Moves = new Map();
  let left = box.x;
  for (const [label, members] of columns) {
    const first = { x: left + PAD, y: box.y + 2 * PAD };
    let y = first.y;
    for (const card of members) {
      moves.set(card.id, { x: first.x, y });
      y += shownRect(card).height + GAP;
    }
    const inside = { ...first, width: Math.max(...members.map((m) => m.width)), height: y - GAP - first.y };
    const section = sectionAround(inside);
    sections.push({ kind: "section", label, x: section.x, y: section.y, width: section.width, height: section.height });
    left = right(section) + GAP;
  }
  const placedCards = [...moves].flatMap(([id, to]) => {
    const node = cards.find((c) => c.id === id)!;
    return node.x === to.x && node.y === to.y ? [] : [{ kind: "place", id, x: to.x, y: to.y } as BoardChange];
  });
  return [...sections, ...placedCards];
}
