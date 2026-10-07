// Dragging items about: pointer travel becomes new positions, snapped to the neighbours.

import type { Point, Rect } from "./geometry.ts";
import type { Item } from "./items.ts";
import { boundsOf, selectionBounds } from "./items.ts";
import type { Mods } from "./modifiers.ts";
import { snapMove } from "./snap.ts";
import type { Axis, Frame, Guide } from "./snap.ts";
import { tidy } from "./tidy.ts";

export interface MoveStart {
  /** The items being dragged. */
  items: readonly Item[];
  /** Everything on the slide: what is not being dragged is what the drag snaps to. */
  all: readonly Item[];
  frame: Frame;
  /** Where the pointer went down, in slide units. */
  grabbed: Point;
  /** Pointer travel, in slide units, below which a press is still a click. Default 3. */
  threshold?: number;
  /** How near a guide must be to snap to it, in slide units. Default 6. */
  snapThreshold?: number;
}

export interface MovePreview {
  /** Where each item's top left goes, by id. */
  moves: Map<string, Point>;
  guides: Guide[];
}

export interface MoveResult {
  /** Empty when the press never became a drag, so there is nothing to commit. */
  moves: Map<string, Point>;
  moved: boolean;
}

const CLICK_TRAVEL = 3;

export class MoveSession {
  private readonly init: MoveStart;
  private readonly origins: ReadonlyMap<string, Point>;
  /** The box round everything being dragged, as turned; what snaps. */
  private readonly bounds: Rect | null;
  private readonly targets: readonly Rect[];
  private dragging = false;
  private latest: Map<string, Point>;

  private constructor(init: MoveStart, origins: ReadonlyMap<string, Point>, bounds: Rect | null, targets: readonly Rect[]) {
    this.init = init;
    this.origins = origins;
    this.bounds = bounds;
    this.targets = targets;
    this.latest = new Map(origins);
  }

  static start(init: MoveStart): MoveSession {
    const moving = new Set(init.items.map((item) => item.id));
    const origins = new Map<string, Point>(init.items.map((item) => [item.id, { x: item.x, y: item.y }]));
    const targets = init.all.filter((item) => !moving.has(item.id)).map(boundsOf);
    return new MoveSession(init, origins, selectionBounds(init.items, moving), targets);
  }

  /** Whether the pointer has travelled far enough for this to be a drag rather than a click. Once it has, it stays one. */
  get moved(): boolean {
    return this.dragging;
  }

  update(pointer: Point, mods: Mods = {}): MovePreview {
    let dx = pointer.x - this.init.grabbed.x;
    let dy = pointer.y - this.init.grabbed.y;
    if (!this.dragging && Math.hypot(dx, dy) < (this.init.threshold ?? CLICK_TRAVEL)) {
      return { moves: new Map(this.origins), guides: [] };
    }
    this.dragging = true;

    // Shift goes whichever way the pointer has gone furthest since the press, and snaps only that way.
    let lock: Axis | undefined;
    if (mods.shift) {
      lock = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      if (lock === "x") dy = 0;
      else dx = 0;
    }

    let guides: Guide[] = [];
    if (this.bounds && !mods.alt && !mods.noSnap) {
      const at = { x: this.bounds.x + dx, y: this.bounds.y + dy, w: this.bounds.w, h: this.bounds.h };
      const snap = snapMove(at, this.targets, this.init.frame, { threshold: this.init.snapThreshold, axis: lock });
      dx += snap.dx;
      dy += snap.dy;
      guides = snap.guides;
    }

    const moves = new Map<string, Point>();
    for (const [id, from] of this.origins) moves.set(id, { x: tidy(from.x + dx), y: tidy(from.y + dy) });
    this.latest = moves;
    return { moves, guides };
  }

  /** The final positions, from a last pointer position if one is given, else the last update. */
  end(pointer?: Point, mods?: Mods): MoveResult {
    if (pointer) this.update(pointer, mods);
    return { moves: this.dragging ? this.latest : new Map(), moved: this.dragging };
  }
}
