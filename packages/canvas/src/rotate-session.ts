// Dragging the rotate handle: one item turns about its centre, several about the group's.

import type { Point } from "./geometry.ts";
import { centre, normaliseAngle, rotatePoint } from "./geometry.ts";
import type { Item } from "./items.ts";
import { selectionBounds } from "./items.ts";
import type { Mods } from "./modifiers.ts";
import { tidy } from "./tidy.ts";
import { ROTATE_STEP, rotationFor } from "./transform.ts";

export interface RotateStart {
  items: readonly Item[];
  /** Where the pointer went down, normally on the rotate handle. */
  grabbed: Point;
}

export interface RotatedBox {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

export interface RotatePreview {
  boxes: Map<string, RotatedBox>;
  /** The angle to show: one item's new rotation, or how far a group has turned. In [0, 360). */
  angle: number;
}

export interface RotateResult extends RotatePreview {
  /** false when nothing differs from how it began, so there is nothing to commit. */
  changed: boolean;
}

const SAME = 1e-9;

/** Whether two angles are the same turn, 359.9999999999 and 0 included. */
const sameAngle = (a: number, b: number): boolean => Math.abs(normaliseAngle(a - b + 180) - 180) < SAME;

export class RotateSession {
  private readonly items: readonly Item[];
  private readonly grabbed: Point;
  private readonly pivot: Point;
  private latest: RotatePreview;

  private constructor(items: readonly Item[], grabbed: Point, pivot: Point) {
    this.items = items;
    this.grabbed = grabbed;
    this.pivot = pivot;
    const boxes = new Map<string, RotatedBox>();
    for (const item of items) boxes.set(item.id, { x: item.x, y: item.y, w: item.w, h: item.h, rotation: normaliseAngle(item.rotation ?? 0) });
    this.latest = { boxes, angle: items.length === 1 ? normaliseAngle(items[0]?.rotation ?? 0) : 0 };
  }

  static start(init: RotateStart): RotateSession {
    const only = init.items.length === 1 ? init.items[0] : undefined;
    const bounds = selectionBounds(init.items, new Set(init.items.map((item) => item.id)));
    return new RotateSession(init.items, init.grabbed, only ? centre(only) : bounds ? centre(bounds) : init.grabbed);
  }

  /** Shift turns in 15 degree steps. */
  update(pointer: Point, mods: Mods = {}): RotatePreview {
    const step = mods.shift ? ROTATE_STEP : undefined;
    const boxes = new Map<string, RotatedBox>();
    const only = this.items.length === 1 ? this.items[0] : undefined;

    let angle: number;
    if (only) {
      angle = tidy(rotationFor(this.pivot, pointer, this.grabbed, only.rotation ?? 0, { step }));
      boxes.set(only.id, { x: only.x, y: only.y, w: only.w, h: only.h, rotation: angle });
    } else {
      // Every centre swings round the group's, and every item turns by the same amount.
      angle = tidy(rotationFor(this.pivot, pointer, this.grabbed, 0, { step }));
      for (const item of this.items) {
        const c = rotatePoint(centre(item), this.pivot, angle);
        boxes.set(item.id, {
          x: tidy(c.x - item.w / 2),
          y: tidy(c.y - item.h / 2),
          w: item.w,
          h: item.h,
          rotation: tidy(normaliseAngle((item.rotation ?? 0) + angle)),
        });
      }
    }
    this.latest = { boxes, angle };
    return { boxes: new Map(boxes), angle };
  }

  /** The final boxes, from a last pointer position if one is given, else the last update. */
  end(pointer?: Point, mods?: Mods): RotateResult {
    if (pointer) this.update(pointer, mods);
    // Any turn changes every item's rotation, and a turn of nothing moves none of them.
    const changed = this.items.some((item) => !sameAngle(this.latest.boxes.get(item.id)?.rotation ?? Number.NaN, item.rotation ?? 0));
    return { boxes: this.latest.boxes, angle: this.latest.angle, changed };
  }
}
