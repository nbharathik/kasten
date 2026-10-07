// Dragging a rectangle over empty canvas to select what it takes in.

import type { Point, Rect } from "./geometry.ts";
import { between } from "./geometry.ts";
import type { Item } from "./items.ts";
import { applySelection, marqueeHits } from "./selection.ts";
import type { MarqueeMode } from "./selection.ts";

export interface MarqueeStart {
  /** Everything that can be picked. */
  all: readonly Item[];
  /** Where the pointer went down. */
  origin: Point;
  /** The selection when the drag began. */
  base: readonly string[];
  /** Whether the drag adds to `base` (Shift held) or replaces it. */
  additive: boolean;
  /** Default "contain". */
  mode?: MarqueeMode;
}

export interface MarqueeState {
  /** The rectangle to draw, with positive size whichever way the drag went. */
  rect: Rect;
  /** The selection the drag would give: `base` first when additive, then what the rectangle takes in. */
  ids: string[];
}

export class MarqueeSession {
  private readonly init: MarqueeStart;
  private latest: MarqueeState;

  private constructor(init: MarqueeStart, latest: MarqueeState) {
    this.init = init;
    this.latest = latest;
  }

  static start(init: MarqueeStart): MarqueeSession {
    // A press that never moves is a click on empty canvas: it clears the selection unless it is additive.
    const ids = init.additive ? [...init.base] : [];
    return new MarqueeSession(init, { rect: { x: init.origin.x, y: init.origin.y, w: 0, h: 0 }, ids });
  }

  update(pointer: Point): MarqueeState {
    const { all, origin, base, additive, mode } = this.init;
    const rect = between(origin, pointer);
    const hits = marqueeHits(all, rect, mode);
    this.latest = { rect, ids: additive ? applySelection(base, hits, "add") : hits };
    return { rect: { ...rect }, ids: [...this.latest.ids] };
  }

  /** The final selection, from a last pointer position if one is given, else the last update. */
  end(pointer?: Point): MarqueeState {
    if (pointer) this.update(pointer);
    return { rect: { ...this.latest.rect }, ids: [...this.latest.ids] };
  }
}
