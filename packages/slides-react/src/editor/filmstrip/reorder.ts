// Dragging slides to a new place with the pointer, for the filmstrip and the
// grid. The pointer's own events are used (not the browser's drag and drop),
// so it works the same in every webview. What is under the pointer is the
// view's business (`locate`); this file holds the gesture, the sums that turn
// a place into a move, and the moving.

import { type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import type { EditorSession } from "../session/session.ts";

/** A move worked out: where the slides go, and what the order becomes. */
export interface MovePlan {
  /** The moving slides, in deck order. */
  ids: string[];
  /** Where the first lands, counted among the slides that stay: what `slides.move` takes. */
  to: number;
  /** The order of the whole deck afterwards. */
  result: string[];
  /** Whether the move changes anything. */
  changed: boolean;
}

/**
 * Moves `moving` to the gap in `order` before the slide at index `gap` (the
 * number of slides is the gap after the last). The moving slides keep their
 * order among themselves, whichever way round they were picked.
 */
export function planMove(order: readonly string[], moving: readonly string[], gap: number): MovePlan {
  const chosen = new Set(moving);
  const ids = order.filter((id) => chosen.has(id));
  const staying = order.filter((id) => !chosen.has(id));
  const at = Math.min(Math.max(Math.round(gap), 0), order.length);
  const to = order.slice(0, at).filter((id) => !chosen.has(id)).length;
  const result = [...staying.slice(0, to), ...ids, ...staying.slice(to)];
  return { ids, to, result, changed: result.some((id, i) => id !== order[i]) };
}

/** Where a drop would land: the gap, and which side of its neighbour a line for it is drawn (a grid needs to say). */
export interface Spot {
  gap: number;
  side?: "start" | "end";
}

/** A drag under way: the slides being moved, and where they would land (null while the pointer points at nothing). */
export interface Drag {
  ids: readonly string[];
  spot: Spot | null;
}

export interface ReorderOptions {
  session: EditorSession;
  /** The spot in the slide order that the pointer points at, or null when it is not over the list. */
  locate(x: number, y: number): Spot | null;
  /** The element that scrolls; it keeps scrolling while the pointer rests near its top or bottom edge. */
  scroller: RefObject<HTMLElement | null>;
}

export interface Reorder {
  drag: Drag | null;
  /** Call from the pointer-down of a slide. A press that does not move stays a click. */
  begin(event: ReactPointerEvent, id: string): void;
  /** Whether the click that follows a drag should be ignored (asking clears it). */
  swallowClick(): boolean;
  /** Put on the element that shows how many slides are in the hand; it follows the pointer. */
  badge: RefObject<HTMLDivElement | null>;
}

/** How far the pointer must move before a press becomes a drag. */
const THRESHOLD = 4;
/** The strip at the edge of the scroller where dragging scrolls it. */
const EDGE = 40;

export function useReorder({ session, locate, scroller }: ReorderOptions): Reorder {
  const [drag, setDrag] = useState<Drag | null>(null);
  const badge = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const swallow = useRef(false);
  const quiet = useRef<number | undefined>(undefined);
  const where = useRef(locate);
  const end = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    where.current = locate;
  });

  const place = useCallback(() => {
    const element = badge.current;
    if (element) element.style.transform = `translate(${pointer.current.x + 14}px, ${pointer.current.y + 14}px)`;
  }, []);

  // The badge appears after the drag starts; put it at the pointer at once.
  useLayoutEffect(place, [drag === null, place]);
  useEffect(() => () => end.current?.(), []);

  const begin = useCallback(
    (event: ReactPointerEvent, id: string) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      end.current?.();
      window.clearTimeout(quiet.current);
      swallow.current = false;
      // With the pointer held by the slide, a release outside the window still ends the drag.
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } catch {
        // Not every environment can capture the pointer; the window's own events do.
      }
      const origin = { x: event.clientX, y: event.clientY };
      pointer.current = origin;
      let ids: string[] | null = null;
      let spot: Spot | null = null;
      let timer: number | undefined;

      const refresh = () => {
        if (!ids) return;
        const next = where.current(pointer.current.x, pointer.current.y);
        if (next?.gap === spot?.gap && next?.side === spot?.side) return;
        spot = next;
        setDrag({ ids, spot });
      };

      // Near the top or bottom edge the list keeps scrolling by itself.
      const scroll = () => {
        const element = scroller.current;
        const rect = element?.getBoundingClientRect();
        if (!element || !rect || rect.height <= 0) return;
        const above = rect.top + EDGE - pointer.current.y;
        const below = pointer.current.y - (rect.bottom - EDGE);
        const speed = above > 0 ? -Math.min(above, EDGE) : below > 0 ? Math.min(below, EDGE) : 0;
        if (speed === 0) return;
        element.scrollTop += speed / 2;
        refresh();
      };

      const finish = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("keydown", onKey, true);
        window.clearInterval(timer);
        end.current = null;
        setDrag(null);
      };

      function onMove(move: PointerEvent) {
        pointer.current = { x: move.clientX, y: move.clientY };
        if (!ids) {
          if (Math.hypot(move.clientX - origin.x, move.clientY - origin.y) < THRESHOLD) return;
          // Pressing an unselected slide and pulling it takes just that one; a selected one takes them all.
          if (!session.state.slideSelection.includes(id)) session.selectSlides([id]);
          const chosen = new Set(session.state.slideSelection);
          ids = session.state.deck.slides.map((slide) => slide.id).filter((other) => chosen.has(other));
          timer = window.setInterval(scroll, 30);
          setDrag({ ids, spot: null });
        }
        place();
        refresh();
      }

      function onUp(up: PointerEvent) {
        const moving = ids;
        finish();
        if (!moving) return;
        // The click that follows a press and a release is not a click on a slide.
        swallow.current = true;
        quiet.current = window.setTimeout(() => (swallow.current = false), 0);
        const target = where.current(up.clientX, up.clientY);
        if (!target) return;
        const plan = planMove(
          session.state.deck.slides.map((slide) => slide.id),
          moving,
          target.gap,
        );
        if (plan.changed) session.slides.move(plan.ids, plan.to);
      }

      function onCancel() {
        finish();
      }

      function onKey(key: KeyboardEvent) {
        if (key.key !== "Escape") return;
        key.preventDefault();
        key.stopPropagation();
        finish();
      }

      end.current = finish;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
    },
    [session, scroller, place],
  );

  const swallowClick = useCallback(() => {
    const was = swallow.current;
    swallow.current = false;
    return was;
  }, []);

  return { drag, begin, swallowClick, badge };
}
