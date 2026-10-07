// What the pointer does on the slide. The React component only turns DOM events
// into calls here and draws `preview`; every decision is made in this class, so
// it is tested with plain numbers. A drag never touches the deck until it ends:
// the preview is drawn from `overrides`, and the result is one engine operation.

import {
  type Guide,
  type Handle,
  MarqueeSession,
  MoveSession,
  type Point,
  type Rect,
  ResizeSession,
  RotateSession,
  type Item,
  boundsOf,
  selectionBounds,
} from "@kasten-slides/canvas";

import { isCompositeType } from "../composite-kinds.ts";
import { requestFieldFocus } from "../field-focus.ts";
import type { EditorSession } from "../session/session.ts";
import type { Placement } from "../session/elements.ts";
import type { EditorUi } from "../ui-state.ts";
import { STICK, drawEnd, finishDraw, lineBox, snapAngle } from "./drawing.ts";
import { hitAt, itemsOf, nearestSite } from "./geometry.ts";

export { boxOfPoints, lineBox, snapAngle } from "./drawing.ts";

/** A pointer event, already in slide units. */
export interface PointerInfo {
  x: number;
  y: number;
  shift: boolean;
  alt: boolean;
  /** Ctrl, or Cmd on a Mac: adds to the selection like Shift. */
  mod: boolean;
  /** 0 is the main button. */
  button: number;
  /** How many presses in a row: 2 is a double click. */
  detail: number;
}

/**
 * What the press landed on. `move` is the move handle: of the block `id`, or of the selection when `id` is null.
 */
export type Target = { kind: "surface" } | { kind: "handle"; handle: Handle } | { kind: "rotate" } | { kind: "end"; end: "start" | "end" } | { kind: "move"; id: string | null };

/** What the pointer is doing to the slide. `grab` is a move that was begun on the move handle. */
export type GestureKind = "move" | "grab" | "resize" | "rotate" | "marquee" | "end" | "draw";

/** What is drawn over the slide while a gesture goes on. */
export interface Preview {
  /** Where the dragged elements are now, for the slide to draw them there. */
  overrides: ReadonlyMap<string, Placement>;
  guides: readonly Guide[];
  /** The selection rectangle being dragged. */
  marquee: Rect | null;
  /** The box or line of a new element being drawn. */
  drawing: { tool: string; from: Point; to: Point } | null;
  /** The angle while turning, in degrees. */
  angle: number | null;
  /** What is going on, once a press has become one; null between gestures. */
  gesture: GestureKind | null;
}

const NONE: Preview = { overrides: new Map(), guides: [], marquee: null, drawing: null, angle: null, gesture: null };

type Gesture =
  | { kind: "move"; session: MoveSession; ids: string[]; clicked: string; wasSelected: boolean; extend: boolean; items: Item[]; grab: boolean }
  | { kind: "resize"; session: ResizeSession }
  | { kind: "rotate"; session: RotateSession }
  | { kind: "marquee"; session: MarqueeSession; extend: boolean }
  | { kind: "end"; id: string; end: "start" | "end"; fixed: Point; from: Point }
  | { kind: "draw"; tool: string; from: Point };

const placementOf = (item: Item, point: Point): Placement => ({ x: point.x, y: point.y, w: item.w, h: item.h });

export class CanvasController {
  private gesture: Gesture | null = null;
  private current: Preview = NONE;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly session: EditorSession,
    private readonly ui: EditorUi,
    /** The scale the slide is drawn at: pixels on screen per slide unit. */
    private readonly zoom: () => number,
  ) {}

  get preview(): Preview {
    return this.current;
  }

  get busy(): boolean {
    return this.gesture !== null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Preview => this.current;

  private show(preview: Preview): void {
    this.current = preview;
    for (const listener of [...this.listeners]) listener();
  }

  private end(): void {
    this.gesture = null;
    this.show(NONE);
  }

  private get frame() {
    const { w, h } = this.session.deck.size;
    return { width: w, height: h, margin: 0 };
  }

  private snapOn(mods: { alt: boolean }): boolean {
    return this.ui.state.snap && !mods.alt;
  }

  // ---- press

  down(p: PointerInfo, target: Target): void {
    if (this.gesture || p.button !== 0) return;
    const at = { x: p.x, y: p.y };
    const tool = this.session.state.tool;
    if (target.kind === "handle") return this.startResize(at, target.handle);
    if (target.kind === "rotate") return this.startRotate(at);
    if (target.kind === "end") return this.startEnd(at, target.end);
    if (target.kind === "move") return this.startGrab(at, target.id);
    if (tool !== "select") {
      this.session.stopEditing();
      this.gesture = { kind: "draw", tool, from: at };
      return this.show({ ...NONE, drawing: { tool, from: at, to: at }, gesture: "draw" });
    }
    const items = itemsOf(this.session);
    const id = hitAt(items, at, this.zoom());
    const extend = p.shift || p.mod;
    if (id === null) {
      this.session.stopEditing();
      this.gesture = { kind: "marquee", session: MarqueeSession.start({ all: items.filter((i) => !i.locked), origin: at, base: this.session.state.selection, additive: extend }), extend };
      return this.show(NONE);
    }
    const wasSelected = this.session.state.selection.includes(id);
    if (this.session.state.editing !== null && this.session.state.editing !== id) this.session.stopEditing();
    if (extend) this.session.select([id], "toggle");
    else if (!wasSelected) this.session.select([id]);
    const ids = this.session.state.selection.filter((chosen) => items.some((i) => i.id === chosen && !i.locked));
    if (ids.length === 0 || !this.session.state.selection.includes(id)) return;
    if (this.session.state.editing === id) return;
    this.beginMove(items, ids, at, { clicked: id, wasSelected, extend, grab: false });
  }

  /** The move of `ids` from a press at `at`: the one gesture a press on a block and a press on its move handle both start. */
  private beginMove(items: Item[], ids: string[], at: Point, how: { clicked: string; wasSelected: boolean; extend: boolean; grab: boolean }): void {
    this.gesture = {
      kind: "move",
      session: MoveSession.start({ items: items.filter((i) => ids.includes(i.id)), all: items, frame: this.frame, grabbed: at, threshold: 3 / this.zoom(), snapThreshold: 6 / this.zoom() }),
      ids,
      items,
      ...how,
    };
  }

  /**
   * A press on a move handle: the move of a press on the block, though the pointer is not over it. The handle of the
   * selection moves the selection, and a text box being edited stays open (the handle is not text, so the caret and what
   * is selected in it are left alone); the handle of a block that is not selected selects it first, and closes any other
   * text box being edited. Modifier keys do not change the selection here: Shift is the axis lock of the move.
   */
  private startGrab(at: Point, id: string | null): void {
    if (this.session.state.tool !== "select") return;
    const items = itemsOf(this.session);
    if (id !== null) {
      if (!items.some((i) => i.id === id && !i.locked)) return;
      if (this.session.state.editing !== null && this.session.state.editing !== id) this.session.stopEditing();
      if (!this.session.state.selection.includes(id)) this.session.select([id]);
    }
    const ids = this.session.state.selection.filter((chosen) => items.some((i) => i.id === chosen && !i.locked));
    const first = ids[0];
    if (first === undefined) return;
    this.beginMove(items, ids, at, { clicked: id ?? first, wasSelected: true, extend: false, grab: true });
    this.show({ ...NONE, gesture: "grab" });
  }

  private startResize(at: Point, handle: Handle): void {
    const items = itemsOf(this.session);
    const chosen = items.filter((i) => this.session.state.selection.includes(i.id) && !i.locked);
    if (chosen.length === 0) return;
    this.gesture = { kind: "resize", session: ResizeSession.start({ items: chosen, handle, all: items, frame: this.frame, grabbed: at, snapThreshold: 6 / this.zoom() }) };
  }

  private startRotate(at: Point): void {
    const chosen = itemsOf(this.session).filter((i) => this.session.state.selection.includes(i.id) && !i.locked);
    if (chosen.length === 0) return;
    this.gesture = { kind: "rotate", session: RotateSession.start({ items: chosen, grabbed: at }) };
  }

  private startEnd(at: Point, end: "start" | "end"): void {
    const items = itemsOf(this.session);
    const id = this.session.state.selection[0];
    const item = items.find((i) => i.id === id);
    const element = this.session.slide.elements.find((e) => e.id === id);
    if (!item || !element || item.locked) return;
    // A line runs from the box's top left to its bottom right, turned by the flips.
    const a = { x: element.flipH ? item.x + item.w : item.x, y: element.flipV ? item.y + item.h : item.y };
    const b = { x: element.flipH ? item.x : item.x + item.w, y: element.flipV ? item.y : item.y + item.h };
    this.gesture = { kind: "end", id: item.id, end, fixed: end === "start" ? b : a, from: at };
  }

  // ---- move

  move(p: PointerInfo): void {
    const g = this.gesture;
    if (!g) return;
    const at = { x: p.x, y: p.y };
    const mods = { shift: p.shift, alt: !this.snapOn({ alt: p.alt }) };
    if (g.kind === "move") {
      const { moves, guides } = g.session.update(at, mods);
      if (!g.session.moved) return;
      const overrides = new Map<string, Placement>();
      for (const item of g.items) {
        const to = moves.get(item.id);
        if (to) overrides.set(item.id, { ...placementOf(item, to), ...(item.rotation ? { rotation: item.rotation } : {}) });
      }
      this.show({ ...NONE, overrides, guides, gesture: g.grab ? "grab" : "move" });
    } else if (g.kind === "resize") {
      const { boxes, guides } = g.session.update(at, { shift: p.shift, alt: p.alt, noSnap: !this.ui.state.snap });
      this.show({ ...NONE, overrides: this.absolute(boxes), guides, gesture: "resize" });
    } else if (g.kind === "rotate") {
      const { boxes, angle } = g.session.update(at, { shift: p.shift });
      this.show({ ...NONE, overrides: boxes, angle, gesture: "rotate" });
    } else if (g.kind === "marquee") {
      const state = g.session.update(at);
      this.show({ ...NONE, marquee: state.rect, gesture: "marquee" });
      this.session.select(state.ids);
    } else if (g.kind === "end") {
      this.show({ ...NONE, overrides: this.endPreview(g, this.endPoint(g, at, p.shift)), gesture: "end" });
    } else {
      this.show({ ...NONE, drawing: { tool: g.tool, from: g.from, to: drawEnd(this.session, this.zoom(), g.tool, g.from, at, p.shift) }, gesture: "draw" });
    }
  }

  /** Where a dragged line end lands: on a side of a shape near it, else the pointer (in 45° steps with Shift). */
  private endPoint(g: Extract<Gesture, { kind: "end" }>, at: Point, shift: boolean): Point {
    const items = itemsOf(this.session);
    const site = nearestSite(items, this.session.slide.elements, at, STICK / this.zoom(), new Set([g.id]));
    if (site) return site.point;
    return shift ? snapAngle(g.fixed, at) : at;
  }

  private endPreview(g: Extract<Gesture, { kind: "end" }>, point: Point): Map<string, Placement> {
    const a = g.end === "start" ? point : g.fixed;
    const b = g.end === "start" ? g.fixed : point;
    return new Map([[g.id, lineBox(a, b)]]);
  }

  // ---- release

  up(p: PointerInfo): void {
    const g = this.gesture;
    if (!g) return;
    const at = { x: p.x, y: p.y };
    const mods = { shift: p.shift, alt: !this.snapOn({ alt: p.alt }) };
    this.gesture = null;
    if (g.kind === "move") {
      const result = g.session.end(at, mods);
      if (result.moved) {
        const placements = new Map<string, Placement>();
        for (const item of g.items) {
          const to = result.moves.get(item.id);
          if (to) placements.set(item.id, placementOf(item, to));
        }
        this.show(NONE);
        this.session.elements.place(placements);
        return;
      }
      // A press that did not move: on one of several selected, it picks that one.
      if (g.wasSelected && !g.extend && !g.grab && g.ids.length > 1) this.session.select([g.clicked]);
    } else if (g.kind === "resize") {
      const result = g.session.end(at, { shift: p.shift, alt: p.alt, noSnap: !this.ui.state.snap });
      this.show(NONE);
      if (result.changed) this.session.elements.place(this.absolute(result.boxes));
      return;
    } else if (g.kind === "rotate") {
      const result = g.session.end(at, { shift: p.shift });
      this.show(NONE);
      if (result.changed) this.session.elements.place(result.boxes);
      return;
    } else if (g.kind === "marquee") {
      const state = g.session.end(at);
      this.session.select(state.ids);
    } else if (g.kind === "end") {
      this.finishEnd(g, this.endPoint(g, at, p.shift));
    } else {
      finishDraw(this.session, this.zoom(), g.tool, g.from, drawEnd(this.session, this.zoom(), g.tool, g.from, at, p.shift));
    }
    this.show(NONE);
  }

  private finishEnd(g: Extract<Gesture, { kind: "end" }>, point: Point): void {
    const moved = Math.hypot(point.x - g.from.x, point.y - g.from.y) > 1;
    if (!moved) return;
    const a = g.end === "start" ? point : g.fixed;
    const b = g.end === "start" ? g.fixed : point;
    const box = lineBox(a, b);
    this.session.elements.place(new Map([[g.id, box]]));
    const site = nearestSite(itemsOf(this.session), this.session.slide.elements, point, STICK / this.zoom(), new Set([g.id]));
    const element = this.session.slide.elements.find((e) => e.id === g.id);
    if (element?.type === "connector") {
      const key = g.end === "start" ? "from" : "to";
      this.session.elements.patch({ [key]: site ? { el: site.id, side: site.side } : null }, [g.id]);
    }
  }

  /** A resize reports a flip when the drag crossed the far edge, meaning "toggle": the element's own flip after it. */
  private absolute(boxes: ReadonlyMap<string, Placement>): Map<string, Placement> {
    const out = new Map<string, Placement>();
    for (const [id, box] of boxes) {
      const element = this.session.slide.elements.find((e) => e.id === id);
      const { flipH, flipV, ...rest } = box;
      out.set(id, { ...rest, ...(flipH ? { flipH: !element?.flipH } : {}), ...(flipV ? { flipV: !element?.flipV } : {}) });
    }
    return out;
  }

  /** Escape during a gesture: put everything back as it was. */
  cancel(): boolean {
    if (!this.gesture) return false;
    this.end();
    return true;
  }

  /** A double click on an element with words in it opens its text for editing; on a composite, its format options, with the caret in the field for what it is made of (the code, the formula ...). */
  doubleClick(p: PointerInfo): void {
    if (this.session.state.tool !== "select") return;
    const items = itemsOf(this.session);
    const id = hitAt(items, { x: p.x, y: p.y }, this.zoom());
    if (id === null) return;
    const element = this.session.slide.elements.find((e) => e.id === id);
    if (element && isCompositeType(element.type)) {
      this.session.select([id]);
      this.ui.openPanel("format");
      requestFieldFocus(this.ui, id);
    } else if (element && (element.type === "text" || element.type === "shape" || element.type === "connector") && !element.locked) this.session.startEditing(id);
  }

  /** The box round the selection, for drawing its frame and handles. */
  selectionBox(): Rect | null {
    const items = itemsOf(this.session);
    return selectionBounds(items, this.session.state.selection);
  }

  /** Every selected element's own turned box. */
  selectedItems(): Item[] {
    const chosen = new Set(this.session.state.selection);
    return itemsOf(this.session).filter((i) => chosen.has(i.id));
  }

  outline(item: Item): Rect {
    return boundsOf(item);
  }
}
