// Which part of the slide's surface can be seen: the stage scrolls, and clips
// what is drawn past its edge, so a handle beyond the edge of the view would
// not be there to be grabbed. The move handle asks, to keep itself in sight.

import type { Rect } from "@kasten-slides/canvas";
import { type RefObject, useLayoutEffect, useState } from "react";

import { STAGE_ROOM } from "./move-handle.ts";

/** Until the stage is measured, and where it cannot be (a test): the view starts the stage's padding before the slide and has no other edge. */
export const UNMEASURED: Rect = { x: -STAGE_ROOM, y: -STAGE_ROOM, w: Infinity, h: Infinity };

/** The part of `layer`, which covers the slide, that can be seen in `stage`: in the layer's own pixels, less the stage's scroll bars. */
export function visibleArea(layer: HTMLElement, stage: HTMLElement): Rect {
  if (stage.clientWidth === 0 || stage.clientHeight === 0) return UNMEASURED;
  const inWindow = stage.getBoundingClientRect();
  const slide = layer.getBoundingClientRect();
  return { x: inWindow.left - slide.left, y: inWindow.top - slide.top, w: stage.clientWidth, h: stage.clientHeight };
}

const same = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && a.w === b.w && a.h === b.h;

/**
 * The visible part of the slide's surface, measured when the zoom changes, when the stage is scrolled and when it is
 * resized, and not on every drawing: the drawing of a drag must not read the layout.
 */
export function useVisibleArea(layer: RefObject<HTMLElement | null>, zoom: number): Rect {
  const [area, setArea] = useState<Rect>(UNMEASURED);
  useLayoutEffect(() => {
    const element = layer.current;
    const stage = element?.closest<HTMLElement>(".ks-stage");
    if (!element || !stage) return;
    const measure = (): void =>
      setArea((now) => {
        const next = visibleArea(element, stage);
        return same(now, next) ? now : next;
      });
    measure();
    stage.addEventListener("scroll", measure, { passive: true });
    const watcher = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    watcher?.observe(stage);
    return () => {
      stage.removeEventListener("scroll", measure);
      watcher?.disconnect();
    };
  }, [layer, zoom]);
  return area;
}
