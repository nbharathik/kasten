// What a person does on a board, each as one batch: writing, colouring,
// sizing, folding, wrapping, connecting, nudging and taking things off.
// Making new things is in making.ts.

import type { BoardChange, BoardEnd, BoardSide, LineStyle } from "../../../../lib/vault/types";
import { noteAt } from "../../../workspace/tree";
import { CARD } from "../model/geometry";
import { align, clusterByTag, distribute, tidy, type Alignment, type Axis } from "../model/layout";
import { mindMap } from "../model/mind-map";
import { carried } from "../model/sections";
import type { BoardController } from "./controller";
import { select, selectedEdges, selectedNodes } from "./store";

/** An expanded card is at least this big, to write in. */
export const EXPANDED = { width: 440, height: 380 } as const;

export const selectedIds = (board: BoardController) => selectedNodes(board.store.getState()).map((n) => n.id);

/** Takes the selected nodes off the board and the selected edges away.
 * Notes stay in the vault. */
export function removeSelection(board: BoardController): void {
  const state = board.store.getState();
  const ids = selectedNodes(state).map((n) => n.id);
  const edges = selectedEdges(state).map((e) => e.id);
  removeFromBoard(board, ids, edges);
}

export function removeFromBoard(board: BoardController, ids: string[], edges: string[] = []): void {
  const changes: BoardChange[] = [];
  if (edges.length) changes.push({ kind: "unlink", ids: edges });
  if (ids.length) changes.push({ kind: "remove", ids });
  board.store.setState({ menu: null, editing: null });
  void board.commit(changes);
}

/** Moves the selection by a few pixels; key repeats undo as one step. */
export function nudge(board: BoardController, dx: number, dy: number): void {
  const ids = selectedIds(board);
  if (ids.length === 0) return;
  const moving = new Set(ids);
  const all = [...ids, ...carried(board.doc.nodes, moving)];
  const changes = all.flatMap((id): BoardChange[] => {
    const node = board.node(id);
    return node ? [{ kind: "place", id, x: node.x + dx, y: node.y + dy }] : [];
  });
  void board.commit(changes, { group: `nudge:${ids.join(",")}`, within: 1000 });
}

/** A web address as typed: `example.com` means `https://example.com`. */
export const webAddress = (text: string) => (/^[a-z][a-z0-9+.-]*:/i.test(text.trim()) ? text.trim() : `https://${text.trim()}`);

/** A sticky's text, a section's label or a link's address. */
export function setText(board: BoardController, id: string, typed: string): void {
  const node = board.node(id);
  board.store.setState({ editing: null });
  if (!node) return;
  if (node.kind === "link" && !typed.trim()) return;
  const text = node.kind === "link" ? webAddress(typed) : typed;
  const old = node.kind === "text" ? (node.text ?? "") : node.kind === "group" ? (node.label ?? "") : (node.url ?? "");
  if (text === old || (node.kind !== "text" && text.trim() === old.trim())) return;
  void board.commit([{ kind: "text", id, text }]);
}

/** Colours nodes and edges; null goes back to the default. */
export function setColor(board: BoardController, ids: string[], color: string | null): void {
  if (ids.length) void board.commit([{ kind: "color", ids, color }]);
}

/** How cards show. Expanding makes a small card big enough to write in. */
export function setCardSize(board: BoardController, ids: string[], size: "title" | "expanded" | null): void {
  const changes: BoardChange[] = [];
  for (const id of ids) {
    const node = board.node(id);
    if (node?.kind !== "file" || (node.size ?? null) === size) continue;
    changes.push({ kind: "card_size", id, size });
    if (size === "expanded" && (node.width < EXPANDED.width || node.height < EXPANDED.height)) {
      changes.push({ kind: "place", id, x: node.x, y: node.y, width: Math.max(node.width, EXPANDED.width), height: Math.max(node.height, EXPANDED.height) });
    }
    // A card made big to write in goes back to a card's size.
    if (size !== "expanded" && node.size === "expanded" && node.width === EXPANDED.width && node.height === EXPANDED.height) {
      changes.push({ kind: "place", id, x: node.x, y: node.y, ...CARD });
    }
  }
  void board.commit(changes);
}

/** Folds a section to its label, or opens it again. */
export function toggleFold(board: BoardController, id: string): void {
  const node = board.node(id);
  if (node?.kind === "group") void board.commit([{ kind: "collapse", id, collapsed: !node.collapsed }]);
}

/** A section around the nodes, whose label is then written. */
export async function wrapInSection(board: BoardController, ids: string[]): Promise<void> {
  board.store.setState({ menu: null });
  if (ids.length === 0) return;
  const applied = await board.commit([{ kind: "wrap", ids, label: "Section" }]);
  const id = applied?.made[0];
  if (!id) return;
  select(board.store, [id]);
  board.store.setState({ editing: id });
}

/** Connects two nodes, from and to the sides dragged between. */
export function connect(board: BoardController, from: string, to: string, fromSide?: BoardSide | null, toSide?: BoardSide | null): void {
  if (from === to || !board.node(from) || !board.node(to)) return;
  const change: BoardChange = { kind: "connect", from, to };
  if (fromSide) change.fromSide = fromSide;
  if (toSide) change.toSide = toSide;
  void board.commit([change]);
}

export interface EdgeStyle {
  label?: string;
  color?: string;
  fromEnd?: BoardEnd | "";
  toEnd?: BoardEnd | "";
}

export function restyleEdge(board: BoardController, id: string, style: EdgeStyle): void {
  board.store.setState({ editing: null });
  const edge = board.doc.edges.find((e) => e.id === id);
  if (!edge) return;
  const same = (Object.keys(style) as (keyof EdgeStyle)[]).every((key) => (style[key] ?? "") === (edge[key] ?? ""));
  if (!same) void board.commit([{ kind: "edge", id, ...style }]);
}

/** How a connection is drawn: straight, curved or elbowed, and dashed. */
export function restyleLine(board: BoardController, id: string, style: { line?: LineStyle | ""; dash?: boolean }): void {
  const edge = board.doc.edges.find((e) => e.id === id);
  if (!edge) return;
  const sameLine = style.line === undefined || (style.line || undefined) === edge.line;
  const sameDash = style.dash === undefined || style.dash === Boolean(edge.dash);
  if (!sameLine || !sameDash) void board.commit([{ kind: "line", id, ...style }]);
}

export type LayoutKind = Alignment | Axis | "tidy" | "cluster" | "mindmap";

/** Lays out the selection, or the whole board when nothing is selected. */
export function layout(board: BoardController, kind: LayoutKind): void {
  const ids = new Set(selectedIds(board));
  const all = board.doc.nodes;
  const chosen = ids.size ? all.filter((n) => ids.has(n.id)) : all;
  const notes = board.deps.notes();
  const tagsOf = (path: string) => noteAt(notes, path)?.tags ?? [];
  const changes =
    kind === "mindmap"
      ? mindMap(all, board.doc.edges, chosen)
      : kind === "tidy"
        ? tidy(all, chosen)
        : kind === "cluster"
          ? clusterByTag(chosen, tagsOf)
          : kind === "horizontal" || kind === "vertical"
            ? distribute(all, chosen, kind)
            : align(all, chosen, kind);
  board.store.setState({ menu: null });
  if (changes.length === 0) {
    const why = { mindmap: "Connect some cards or stickies to lay them out as a mind map", cluster: "Select some cards for notes to cluster" } as Partial<Record<LayoutKind, string>>;
    return board.deps.toast(why[kind] ?? "Select more things to lay out");
  }
  void board.commit(changes);
}
