// Where each slide sits in the grid. The tiles all have one size and are laid
// out on a fixed grid, so the page a tile is on, which thumbnails are near the
// window and where a dragged slide would land all come from these numbers.

import type { Deck } from "@kasten-slides/wasm";

import { FRAME, thumbHeight } from "../filmstrip/model.ts";
import type { Spot } from "../filmstrip/reorder.ts";

/** The width of a thumbnail. */
export const TILE_W = 260;
/** The width of a tile: the thumbnail and its border. */
export const OUTER_W = TILE_W + FRAME;
/** Room under a thumbnail for its number. */
export const LABEL_H = 30;
export const GAP_X = 24;
export const GAP_Y = 16;
/** Room round the grid, inside the scroller. */
export const PAD = 28;

export const PITCH_X = OUTER_W + GAP_X;

export interface GridGeometry {
  columns: number;
  /** The height of a thumbnail with its border. */
  frameHeight: number;
  /** The height of a tile: the thumbnail, its border and the label. */
  tileHeight: number;
  pitchY: number;
  /** The width of the grid. */
  width: number;
}

/** How many tiles fit across a scroller `width` pixels wide. */
export function columnsFor(width: number): number {
  return Math.max(1, Math.floor((width - 2 * PAD + GAP_X) / PITCH_X));
}

export function geometryOf(size: Deck["size"], scrollerWidth: number): GridGeometry {
  const columns = columnsFor(scrollerWidth);
  const frameHeight = thumbHeight(size, TILE_W) + FRAME;
  const tileHeight = frameHeight + LABEL_H;
  return { columns, frameHeight, tileHeight, pitchY: tileHeight + GAP_Y, width: columns * PITCH_X - GAP_X };
}

/** Where the tile at `index` starts, from the top left of the grid. */
export function tileAt(index: number, geometry: GridGeometry): { left: number; top: number; row: number; column: number } {
  const row = Math.floor(index / geometry.columns);
  const column = index % geometry.columns;
  return { left: column * PITCH_X, top: row * geometry.pitchY, row, column };
}

/**
 * The gap a point over the grid is at, from its place relative to the grid's
 * top left: over the left half of a tile it is the gap before that tile, over
 * the right half the gap after it, and past the last tile the end.
 */
export function spotAt(x: number, y: number, count: number, geometry: GridGeometry): Spot {
  const rows = Math.max(1, Math.ceil(count / geometry.columns));
  const column = Math.min(Math.max(Math.floor((x + GAP_X / 2) / PITCH_X), 0), geometry.columns - 1);
  const row = Math.min(Math.max(Math.floor((y + GAP_Y / 2) / geometry.pitchY), 0), rows - 1);
  const index = row * geometry.columns + column;
  if (index >= count) return { gap: count, side: "end" };
  return x - column * PITCH_X < OUTER_W / 2 ? { gap: index, side: "start" } : { gap: index + 1, side: "end" };
}

/** Where the line for a drop is drawn: its left and top from the grid's top left. The line is as tall as a thumbnail. */
export function lineAt(spot: Spot, count: number, geometry: GridGeometry): { left: number; top: number } {
  const after = spot.side === "end" || spot.gap >= count;
  const next = tileAt(after ? Math.max(spot.gap - 1, 0) : spot.gap, geometry);
  return { left: after ? next.left + OUTER_W + GAP_X / 2 - 1.5 : next.left - GAP_X / 2 - 1.5, top: next.top };
}
