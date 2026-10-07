// Turning pointer movement into new boxes: resize, rotate, scale and nudge.

import type { Point, Rect } from "./geometry.ts";
import { centre, directionOf, normaliseAngle, rotatePoint, snapTo } from "./geometry.ts";
import type { Box } from "./items.ts";

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** The resize handles, clockwise from the top left. */
export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** How far above the top middle the rotate handle floats, in screen pixels (divide by zoom for slide units). */
export const ROTATE_OFFSET = 24;

/** The angle Shift snaps a rotation to. */
export const ROTATE_STEP = 15;

/** Which edges a handle drags: -1 the left or top one, +1 the right or bottom one, 0 neither. */
export interface HandleDirection {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

const DIRECTION: Record<Handle, HandleDirection> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

export const handleDirection = (handle: Handle): HandleDirection => DIRECTION[handle];

const MIRRORED_ACROSS: Record<Handle, Handle> = { nw: "ne", n: "n", ne: "nw", e: "w", se: "sw", s: "s", sw: "se", w: "e" };
const MIRRORED_DOWN: Record<Handle, Handle> = { nw: "sw", n: "s", ne: "se", e: "e", se: "ne", s: "n", sw: "nw", w: "w" };

/** The handle that is really being dragged once a resize has carried it past the fixed edge (`flip` is what resizeBox reported). */
export function mirrorHandle(handle: Handle, flip: { h?: boolean; v?: boolean }): Handle {
  const across = flip.h ? MIRRORED_ACROSS[handle] : handle;
  return flip.v ? MIRRORED_DOWN[across] : across;
}

/** The centre of each resize handle by name, and `rotate`, where the rotate handle floats: above the top middle in the box's own frame. */
export type HandlePoints = Record<Handle | "rotate", Point>;

/** Where the handles of a box are, turned with it, in slide units. `zoom` keeps the rotate handle a constant distance away on screen. */
export function handlePoints(item: Box, zoom = 1): HandlePoints {
  const pivot = centre(item);
  const turn = item.rotation ?? 0;
  const place = (p: Point): Point => (turn === 0 ? p : rotatePoint(p, pivot, turn));
  const at = (handle: Handle): Point => {
    const d = DIRECTION[handle];
    return place({ x: item.x + (item.w * (d.x + 1)) / 2, y: item.y + (item.h * (d.y + 1)) / 2 });
  };
  return {
    nw: at("nw"),
    n: at("n"),
    ne: at("ne"),
    e: at("e"),
    se: at("se"),
    s: at("s"),
    sw: at("sw"),
    w: at("w"),
    rotate: place({ x: pivot.x, y: item.y - ROTATE_OFFSET / (zoom > 0 ? zoom : 1) }),
  };
}

export interface ResizeOptions {
  /** Keep the start proportions. From an edge handle the other side scales about its centre line. */
  keepRatio?: boolean;
  /** Resize about the centre, so the opposite edge moves as far the other way. */
  fromCentre?: boolean;
  /** No resized side is shorter than this. Default 1. */
  minSize?: number;
}

export interface ResizeOutcome {
  /** Always with positive sizes, and the start's rotation. */
  box: Box;
  /** The dragged edge went past the opposite one, so the box is mirrored left to right. */
  flipH: boolean;
  /** The same, top to bottom. */
  flipV: boolean;
}

/** `s` pushed out to at least `min` long, keeping its sign: a box dragged inside out stays inside out. */
const atLeast = (s: number, min: number): number => (s < 0 ? Math.min(s, -min) : Math.max(s, min));

/**
 * The box after dragging `handle` by `pointer`, the pointer's total movement in
 * slide units since the drag began. The movement is taken along the box's own
 * axes, so the east handle of a turned box changes its width whichever way it
 * has been turned; the opposite edge (the centre with `fromCentre`) does not
 * move in slide space.
 */
export function resizeBox(start: Box, handle: Handle, pointer: { dx: number; dy: number }, opts: ResizeOptions = {}): ResizeOutcome {
  const dir = DIRECTION[handle];
  const min = opts.minSize ?? 1;
  const reach = opts.fromCentre ? 2 : 1;

  // `along` is the box's own x axis in slide space; its y axis is a quarter turn clockwise from it.
  const along = directionOf(start.rotation ?? 0);
  const dx = pointer.dx * along.x + pointer.dy * along.y;
  const dy = pointer.dy * along.x - pointer.dx * along.y;

  // Signed, so a side dragged past the fixed edge is negative: that is a flip.
  let sw = start.w + dir.x * dx * reach;
  let sh = start.h + dir.y * dy * reach;

  if (opts.keepRatio && start.w > 0 && start.h > 0) {
    // One scale for both sides; the side the pointer has gone furthest along sets it.
    const kx = dir.x === 0 ? 0 : Math.abs(sw) / start.w;
    const ky = dir.y === 0 ? 0 : Math.abs(sh) / start.h;
    const k = Math.max(kx, ky, min / Math.min(start.w, start.h));
    sw = (dir.x !== 0 && sw < 0 ? -k : k) * start.w;
    sh = (dir.y !== 0 && sh < 0 ? -k : k) * start.h;
  } else {
    // A side the handle does not drag is left as it was, even a line's zero thickness.
    if (dir.x !== 0) sw = atLeast(sw, min);
    if (dir.y !== 0) sh = atLeast(sh, min);
  }

  // The centre moves half of what the dragged side grew, towards it, so the far edge stays put.
  const ox = opts.fromCentre ? 0 : (dir.x * (sw - start.w)) / 2;
  const oy = opts.fromCentre ? 0 : (dir.y * (sh - start.h)) / 2;
  const c = centre(start);
  const cx = c.x + along.x * ox - along.y * oy;
  const cy = c.y + along.y * ox + along.x * oy;

  const w = Math.abs(sw);
  const h = Math.abs(sh);
  const box: Box = { x: cx - w / 2, y: cy - h / 2, w, h };
  if (start.rotation !== undefined) box.rotation = start.rotation;
  return { box, flipH: dir.x !== 0 && sw < 0, flipV: dir.y !== 0 && sh < 0 };
}

/**
 * The rotation, in degrees within [0, 360), that keeps a box under the pointer's
 * angle about `pivot`: the box was `startRotation` when the pointer went down at
 * `grabbedAt`. With `step` the result lands on a multiple of it.
 */
export function rotationFor(pivot: Point, pointer: Point, grabbedAt: Point, startRotation: number, opts: { step?: number } = {}): number {
  const now = { x: pointer.x - pivot.x, y: pointer.y - pivot.y };
  const then = { x: grabbedAt.x - pivot.x, y: grabbedAt.y - pivot.y };
  let turned = startRotation;
  // A point on the pivot has no direction, so there is no angle to follow.
  if ((now.x !== 0 || now.y !== 0) && (then.x !== 0 || then.y !== 0)) {
    turned += ((Math.atan2(now.y, now.x) - Math.atan2(then.y, then.x)) * 180) / Math.PI;
  }
  const angle = normaliseAngle(turned);
  return opts.step ? normaliseAngle(snapTo(angle, opts.step)) : angle;
}

/**
 * Maps boxes from the box `from` to the box `to`, as when several items are
 * resized as one. Each item's centre is mapped, and its sides are stretched
 * along its own axes, so an item turned a quarter still fills the same share of
 * the box. Rotation is kept.
 */
export function scaleWithin<T extends Box>(items: readonly T[], from: Rect, to: Rect): T[] {
  // A group with no width (or height) has nothing to stretch on that axis; it only moves.
  const sx = from.w === 0 ? 1 : to.w / from.w;
  const sy = from.h === 0 ? 1 : to.h / from.h;
  return items.map((item) => {
    const c = centre(item);
    const cx = to.x + (c.x - from.x) * sx;
    const cy = to.y + (c.y - from.y) * sy;
    const along = directionOf(item.rotation ?? 0);
    const w = item.w * Math.hypot(along.x * sx, along.y * sy);
    const h = item.h * Math.hypot(along.y * sx, along.x * sy);
    return { ...item, x: cx - w / 2, y: cy - h / 2, w, h };
  });
}

/**
 * Reflects boxes across the middle of `box`, as when a group is resized inside
 * out. A reflection turns rotation the other way, so a box leaning 30 degrees
 * comes out leaning 330; reflecting both ways cancels that.
 */
export function mirrorWithin<T extends Box>(items: readonly T[], box: Rect, flip: { h?: boolean; v?: boolean }): T[] {
  const pivot = centre(box);
  const reverses = Boolean(flip.h) !== Boolean(flip.v);
  return items.map((item) => {
    const c = centre(item);
    const cx = flip.h ? 2 * pivot.x - c.x : c.x;
    const cy = flip.v ? 2 * pivot.y - c.y : c.y;
    const turn = item.rotation !== undefined && reverses ? { rotation: normaliseAngle(-item.rotation) } : {};
    return { ...item, x: cx - item.w / 2, y: cy - item.h / 2, ...turn };
  });
}

/** The boxes moved by (`dx`, `dy`). */
export function nudge<T extends Box>(items: readonly T[], dx: number, dy: number): T[] {
  return items.map((item) => ({ ...item, x: item.x + dx, y: item.y + dy }));
}
