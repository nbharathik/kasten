// Board nodes and edges as JSON Canvas writes them, and back: `restore`
// (undo) takes the file's own shape, `{id, type, x, y, ...}` and
// `{id, fromNode, toNode, ...}`.

import type { BoardEdge, BoardEnd, BoardNode, BoardSide } from "../../../../lib/vault/types";

type Raw = Record<string, unknown>;

/** A node as the file keeps it. Card sizes and folded sections live in
 * `x-kasten`, not here: `restore` is followed by `card_size` and `collapse`.
 * A shape's outline and a drawing's points ride along under the node's own
 * `x-kasten`, which the core puts back where they belong. */
export function rawNode(node: BoardNode): Raw {
  const out: Raw = { id: node.id, type: node.kind };
  if (node.kind === "file" && node.file !== undefined) out.file = node.file;
  if (node.kind === "text") out.text = node.text ?? "";
  if (node.kind === "link" && node.url !== undefined) out.url = node.url;
  if (node.kind === "group" && node.label) out.label = node.label;
  Object.assign(out, { x: node.x, y: node.y, width: node.width, height: node.height });
  if (node.color) out.color = node.color;
  if (node.shape || node.draw) out["x-kasten"] = { ...(node.shape ? { shape: node.shape } : {}), ...(node.draw ? { draw: node.draw } : {}) };
  return out;
}

export function rawEdge(edge: BoardEdge): Raw {
  const out: Raw = { id: edge.id, fromNode: edge.from };
  if (edge.fromSide) out.fromSide = edge.fromSide;
  if (edge.fromEnd) out.fromEnd = edge.fromEnd;
  out.toNode = edge.to;
  if (edge.toSide) out.toSide = edge.toSide;
  if (edge.toEnd) out.toEnd = edge.toEnd;
  if (edge.color) out.color = edge.color;
  if (edge.label) out.label = edge.label;
  if (edge.line || edge.dash) out["x-kasten"] = { ...(edge.line ? { line: edge.line } : {}), ...(edge.dash ? { dash: true } : {}) };
  return out;
}

const said = (raw: Raw): Raw => {
  const extra = raw["x-kasten"];
  return typeof extra === "object" && extra !== null && !Array.isArray(extra) ? (extra as Raw) : {};
};

const text = (raw: Raw, key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : undefined);
const num = (raw: Raw, key: string) => Math.round(Number(raw[key]) || 0);

/** The board view's node for a raw one (as the core's view reads it). */
export function nodeFromRaw(raw: Raw): BoardNode {
  const node: BoardNode = { id: String(raw.id), kind: String(raw.type), x: num(raw, "x"), y: num(raw, "y"), width: Math.max(0, num(raw, "width")), height: Math.max(0, num(raw, "height")) };
  if (node.kind === "file") node.file = text(raw, "file");
  if (node.kind === "text") node.text = text(raw, "text") ?? "";
  if (node.kind === "link") node.url = text(raw, "url");
  if (node.kind === "group" && text(raw, "label")) node.label = text(raw, "label");
  if (text(raw, "color")) node.color = text(raw, "color");
  const extra = said(raw);
  if (node.kind === "text" && typeof extra.shape === "string") node.shape = extra.shape as BoardNode["shape"];
  const draw = extra.draw as Raw | undefined;
  if (node.kind === "text" && draw && typeof draw.points === "string" && typeof draw.size === "number") node.draw = { points: draw.points, size: draw.size };
  return node;
}

const set = (raw: Raw, key: string) => {
  const value = text(raw, key);
  return value && value.trim() ? value : undefined;
};

export function edgeFromRaw(raw: Raw): BoardEdge {
  const edge: BoardEdge = { id: String(raw.id), from: String(raw.fromNode), to: String(raw.toNode) };
  const label = set(raw, "label");
  if (label) edge.label = label;
  const color = set(raw, "color");
  if (color) edge.color = color;
  const fromSide = set(raw, "fromSide");
  if (fromSide) edge.fromSide = fromSide as BoardSide;
  const toSide = set(raw, "toSide");
  if (toSide) edge.toSide = toSide as BoardSide;
  const fromEnd = set(raw, "fromEnd");
  if (fromEnd) edge.fromEnd = fromEnd as BoardEnd;
  const toEnd = set(raw, "toEnd");
  if (toEnd) edge.toEnd = toEnd as BoardEnd;
  const extra = said(raw);
  if (typeof extra.line === "string") edge.line = extra.line as BoardEdge["line"];
  if (extra.dash === true) edge.dash = true;
  return edge;
}
