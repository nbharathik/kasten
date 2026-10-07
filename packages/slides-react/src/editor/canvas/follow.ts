// Connectors that stay attached while the elements they join are dragged. The
// engine puts a connector back between its elements when a drag is committed
// (ops/geometry.rs, `reroute`); this does the same on the copy of the slide
// that the canvas draws during the drag, so the line follows the pointer.

import type { Anchor, Element, Slide } from "@kasten-slides/wasm";

import { boxOf } from "../../theme/index.ts";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The middle of the side an end is fixed to. */
function pointOf(rects: ReadonlyMap<string, Rect>, anchor: Anchor | null | undefined): [number, number] | null {
  const r = anchor ? rects.get(anchor.el) : undefined;
  if (!r) return null;
  switch (anchor!.side) {
    case "left":
      return [r.x, r.y + r.h / 2];
    case "right":
      return [r.x + r.w, r.y + r.h / 2];
    case "top":
      return [r.x + r.w / 2, r.y];
    case "bottom":
      return [r.x + r.w / 2, r.y + r.h];
  }
}

/** The boxes of the elements on a slide, by id, groups' children included. */
function collect(elements: readonly Element[], resolve: (element: Element) => Rect | null, out: Map<string, Rect>): void {
  for (const element of elements) {
    const rect = resolve(element);
    if (rect) out.set(element.id, rect);
    if (element.type === "group") collect(element.children, resolve, out);
  }
}

/**
 * The slide with every connector put between the elements it joins, as they
 * are drawn: `moved` gives the boxes of the elements a drag has taken from
 * where `slide` has them. Connectors that join nothing that has moved are the
 * same objects, so they are not drawn again.
 */
export function withFollowing(slide: Slide, theme: Parameters<typeof boxOf>[0], moved: ReadonlyMap<string, Rect>): Slide {
  if (moved.size === 0) return slide;
  // Where each element is drawn: where the drag has taken it, else where the slide has it.
  const rects = new Map<string, Rect>();
  collect(slide.elements, (e) => moved.get(e.id) ?? boxOf(theme, slide.layout, e), rects);

  let changed = false;
  const follow = (element: Element): Element => {
    if (element.type === "group") {
      const children = element.children.map(follow);
      return children.some((child, i) => child !== element.children[i]) ? { ...element, children } : element;
    }
    if (element.type !== "connector") return element;
    const touches = [element.from, element.to].some((a) => a && moved.has(a.el));
    if (!touches) return element;
    const own = boxOf(theme, slide.layout, element);
    if (!own) return element;
    const start = pointOf(rects, element.from) ?? [element.flipH ? own.x + own.w : own.x, element.flipV ? own.y + own.h : own.y];
    const end = pointOf(rects, element.to) ?? [element.flipH ? own.x : own.x + own.w, element.flipV ? own.y : own.y + own.h];
    changed = true;
    return {
      ...element,
      x: round2(Math.min(start[0], end[0])),
      y: round2(Math.min(start[1], end[1])),
      w: round2(Math.abs(end[0] - start[0])),
      h: round2(Math.abs(end[1] - start[1])),
      flipH: end[0] < start[0],
      flipV: end[1] < start[1],
    };
  };
  const elements = slide.elements.map(follow);
  return changed ? { ...slide, elements } : slide;
}
