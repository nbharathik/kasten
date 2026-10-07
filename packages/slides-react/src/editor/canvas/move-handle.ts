// The move handle: a small chip at the top left of a block that is grabbed to
// move the block, so that moving never means finding the block's border or
// pulling at text that is being edited. It is drawn over the slide, never in
// it, in screen pixels: the chip is the same size at every zoom, like the
// resize handles. What is worked out here is where it goes and which blocks
// have one; the drag itself is the controller's move.

import { type Item, type Rect, boundsOf, clamp, directionOf, rotatePoint, union } from "@kasten-slides/canvas";

import type { Preview } from "./controller.ts";

/** The side of the chip, in screen pixels. */
export const CHIP = 24;
/** How far the chip stands from the corner when it is outside the block; more than the 4.5 px the corner's resize handle reaches. */
export const GAP = 6;
/** How far it stands from the corner when it has to go inside the block. */
export const INSET = 6;
/** How much room the stage keeps round the slide (the padding of `.ks-page-wrap`), where the view is not known. */
export const STAGE_ROOM = 24;

export interface Place {
  /** The chip's top left, in screen pixels from the top left of the slide. */
  x: number;
  y: number;
  /** The chip is inside the block's corner, because outside there was no room to see it. */
  inside: boolean;
}

export interface Wanted {
  /** The block's box in screen pixels, before any turn. */
  box: Rect;
  /** Degrees clockwise about the box's centre. */
  rotation?: number;
  /** The part of the slide's surface that can be seen (the stage less what is scrolled away): outside it the chip would be cut off. */
  area: Rect;
}

/** A box in slide units as it is on the screen. */
export const onScreen = (box: Rect, zoom: number): Rect => ({ x: box.x * zoom, y: box.y * zoom, w: box.w * zoom, h: box.h * zoom });

const fits = (chip: Rect, area: Rect): boolean => chip.x >= area.x && chip.y >= area.y && chip.x + chip.w <= area.x + area.w && chip.y + chip.h <= area.y + area.h;

/** `n` held between `low` and `high`, or at `low` when there is no room between them. */
const pin = (n: number, low: number, high: number): number => (high < low ? low : clamp(n, low, high));

/**
 * Where the chip goes for a block: outside its top left corner, along the block's own up and left (so a turned block
 * has it at its turned corner, the chip itself staying upright). If the whole chip could not be seen there, inside the
 * corner. If it could not be seen there either, because the corner is scrolled out of view, the outside place moved
 * into view, which puts it at the edge of the view beside the part of the block that can be seen.
 */
export function placeMoveHandle({ box, rotation = 0, area }: Wanted): Place {
  const centre = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const right = directionOf(rotation);
  const down = { x: -right.y, y: right.x };
  const corner = rotatePoint({ x: box.x, y: box.y }, centre, rotation);
  // One step along the block's own right and down, which is a step in from its corner.
  const chipAt = (step: number): Rect => ({
    x: corner.x + (right.x + down.x) * step - CHIP / 2,
    y: corner.y + (right.y + down.y) * step - CHIP / 2,
    w: CHIP,
    h: CHIP,
  });
  const outside = chipAt(-(GAP + CHIP / 2));
  if (fits(outside, area)) return { x: outside.x, y: outside.y, inside: false };
  const inside = chipAt(INSET + CHIP / 2);
  if (fits(inside, area)) return { x: inside.x, y: inside.y, inside: true };
  return { x: pin(outside.x, area.x, area.x + area.w - CHIP), y: pin(outside.y, area.y, area.y + area.h - CHIP), inside: false };
}

/** A block's handle. */
export interface Handle {
  /** `selection`: the selected block or blocks, moved together. `hover`: a block that is not selected, lighter, to be selected by the grab. */
  kind: "selection" | "hover";
  /** The block a hover handle belongs to; null for the selection's. */
  id: string | null;
  /** In slide units. */
  box: Rect;
  rotation: number;
}

export interface HandlesInput {
  /** The selected blocks, with any preview position applied. */
  selected: readonly Item[];
  /** The box round several selected blocks. */
  group: Rect | null;
  /** The block under the pointer. */
  hovered: Item | null;
  /** What the pointer is doing to the slide. */
  gesture: Preview["gesture"];
  /** The select tool is in hand: a drawing tool armed makes every press a drawing. */
  active: boolean;
}

/** Gestures during which the handles are out of the way: only a move keeps its handle, which the block carries along. */
const OUT_OF_THE_WAY: ReadonlySet<NonNullable<Preview["gesture"]>> = new Set(["resize", "rotate", "marquee", "end", "draw"]);

/**
 * The handles to draw. A selection has one (on the block, or on the box round several) unless nothing in it can be moved,
 * and a block under the pointer that is not selected has a lighter one, so that a block is moved in one drag without
 * selecting it first. A locked block has none.
 */
export function moveHandles({ selected, group, hovered, gesture, active }: HandlesInput): Handle[] {
  if (!active || (gesture !== null && OUT_OF_THE_WAY.has(gesture))) return [];
  const handles: Handle[] = [];
  if (selected.some((item) => !item.locked)) {
    const only = selected.length === 1 ? selected[0] : undefined;
    if (only) handles.push({ kind: "selection", id: null, box: { x: only.x, y: only.y, w: only.w, h: only.h }, rotation: only.rotation ?? 0 });
    else {
      const around = group ?? union(selected.map(boundsOf));
      if (around) handles.push({ kind: "selection", id: null, box: around, rotation: 0 });
    }
  }
  if (hovered && !hovered.locked && !selected.some((item) => item.id === hovered.id)) {
    handles.push({ kind: "hover", id: hovered.id, box: { x: hovered.x, y: hovered.y, w: hovered.w, h: hovered.h }, rotation: hovered.rotation ?? 0 });
  }
  return handles;
}
