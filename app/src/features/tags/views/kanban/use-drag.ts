// Dragging cards between columns with pointer events, no library and no
// HTML5 drag and drop, so it feels the same in every webview: a press that
// travels a few pixels lifts a copy of the card that follows the pointer,
// the column under it lights up, the board and the column scroll near their
// edges, and letting go over another column that takes cards moves it.
// Escape or leaving the window puts it back. What the drag shows lives in
// data attributes (`data-dragging`, `data-over`), so carrying a card redraws
// nothing in React until it is dropped.

import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { flushSync } from "react-dom";

import { nudge, SLOP, swallowClick } from "../../../../ui/pointer-drag";

/** Attributes the lifted copy must not carry: it is only a picture. */
const PICTURE_ONLY = ["id", "role", "tabindex", "aria-label", "aria-describedby", "data-card", "data-landed"];

interface Session {
  path: string;
  pointer: number;
  card: HTMLElement;
  /** The column it starts in (its `data-column`). */
  from: string;
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** Where the pointer holds the card, so the copy stays under it. */
  grabX: number;
  grabY: number;
  /** What the pointer was last over, where the page cannot say what is at a point. */
  target: EventTarget | null;
  ghost: HTMLElement | null;
  over: HTMLElement | null;
  frame: number;
  finish(land: boolean): void;
}

export interface CardDrag {
  /** A press on a card: it becomes a drag once the pointer travels. */
  press(event: ReactPointerEvent<HTMLElement>, path: string): void;
}

/** A copy of the card to carry: the same look, none of its handles. */
function picture(card: HTMLElement, width: number): HTMLElement {
  const ghost = document.createElement("div");
  ghost.className = "kasten-kanban-ghost";
  ghost.setAttribute("aria-hidden", "true");
  const copy = card.cloneNode(true) as HTMLElement;
  for (const el of [copy, ...copy.querySelectorAll<HTMLElement>("*")]) for (const name of PICTURE_ONLY) el.removeAttribute(name);
  copy.style.width = `${width}px`;
  ghost.append(copy);
  return ghost;
}

export function useCardDrag(root: RefObject<HTMLElement | null>, onDrop: (path: string, column: string) => void): CardDrag {
  const drop = useRef(onDrop);
  useLayoutEffect(() => {
    drop.current = onDrop;
  });
  const active = useRef<Session | null>(null);
  // Leaving the view mid-drag puts the card back.
  useEffect(() => () => active.current?.finish(false), []);

  const press = useCallback(
    (event: ReactPointerEvent<HTMLElement>, path: string) => {
      // Modifier clicks open the card elsewhere; they never drag.
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || active.current) return;
      const card = event.currentTarget;
      const from = card.closest<HTMLElement>("[data-column]")?.dataset.column;
      if (from === undefined) return;
      const { clientX: x, clientY: y } = event;

      const hit = () => {
        const found = document.elementFromPoint?.(s.x, s.y) ?? (s.target instanceof Element ? s.target : null);
        const column = found?.closest<HTMLElement>("[data-column]") ?? null;
        const over = column && root.current?.contains(column) ? column : null;
        if (over === s.over) return;
        s.over?.removeAttribute("data-over");
        s.over = over;
        over?.setAttribute("data-over", over.dataset.column === s.from ? "home" : over.hasAttribute("data-refuses") ? "refused" : "");
      };
      const place = () => {
        if (s.ghost) s.ghost.style.transform = `translate3d(${s.x - s.grabX}px, ${s.y - s.grabY}px, 0)`;
      };
      const lift = () => {
        const box = card.getBoundingClientRect();
        s.grabX = s.x0 - box.left;
        s.grabY = s.y0 - box.top;
        s.ghost = picture(card, box.width);
        document.body.append(s.ghost);
        card.setAttribute("data-dragging", "");
        root.current?.setAttribute("data-dragging", "");
        document.getSelection()?.removeAllRanges();
      };
      const scroll = () => {
        s.frame = 0;
        if (!s.ghost) return;
        const board = root.current?.querySelector<HTMLElement>("[data-board]");
        const list = s.over?.querySelector<HTMLElement>("[data-cards]");
        const sideways = board ? nudge(board, "x", s.x) : false;
        const down = list ? nudge(list, "y", s.y) : false;
        if (!sideways && !down) return;
        hit();
        s.frame = requestAnimationFrame(scroll);
      };
      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== s.pointer) return;
        // Let go somewhere the page never heard of it.
        if ((e.buttons & 1) === 0) return s.finish(false);
        s.x = e.clientX;
        s.y = e.clientY;
        s.target = e.target;
        if (!s.ghost) {
          if (Math.hypot(s.x - s.x0, s.y - s.y0) < SLOP) return;
          lift();
        }
        e.preventDefault();
        place();
        hit();
        if (!s.frame && typeof requestAnimationFrame === "function") s.frame = requestAnimationFrame(scroll);
      };
      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== s.pointer) return;
        s.x = e.clientX;
        s.y = e.clientY;
        s.target = e.target;
        if (s.ghost) hit();
        s.finish(true);
      };
      const onCancel = () => s.finish(false);
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        // Escape belongs to a drag; a mere press lets it through.
        if (s.ghost) {
          e.preventDefault();
          e.stopPropagation();
        }
        s.finish(false);
      };

      const s: Session = {
        path,
        pointer: event.pointerId,
        card,
        from,
        x0: x,
        y0: y,
        x,
        y,
        grabX: 0,
        grabY: 0,
        target: event.target,
        ghost: null,
        over: null,
        frame: 0,
        finish: (land) => {
          if (active.current !== s) return;
          active.current = null;
          if (s.frame) cancelAnimationFrame(s.frame);
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onCancel);
          window.removeEventListener("keydown", onKey, true);
          window.removeEventListener("blur", onCancel);
          const { ghost, over } = s;
          over?.removeAttribute("data-over");
          card.removeAttribute("data-dragging");
          root.current?.removeAttribute("data-dragging");
          if (!ghost) return; // A click, not a drag: the click opens the card.
          ghost.remove();
          swallowClick();
          const to = over?.dataset.column;
          // At once, so the copy goes and the card shows in its new column in
          // the same frame (this listener is not React's, whose updates wait).
          if (land && over && to !== undefined && to !== s.from && !over.hasAttribute("data-refuses")) flushSync(() => drop.current(path, to));
        },
      };
      active.current = s;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("keydown", onKey, true);
      window.addEventListener("blur", onCancel);
    },
    [root],
  );

  return { press };
}
