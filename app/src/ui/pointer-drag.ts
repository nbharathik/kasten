// What the app's pointer drags share (a kanban card, a page's block): how far
// a press travels before it is a drag, scrolling near a scroller's edges, and
// swallowing the click that ends a drag.

/** How far a press travels, in CSS pixels, before it is a drag. */
export const SLOP = 5;
/** Scrolling starts this close to a scroller's edge... */
const EDGE = 56;
/** ...at up to this many pixels a frame. */
const SPEED = 18;

/** Keeps the click that ends a drag from reaching what is under it. */
export function swallowClick(): void {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
}

/** Scrolls `el` along `axis` when `pos` is near (or past) its edges; true when it moved. */
export function nudge(el: HTMLElement, axis: "x" | "y", pos: number): boolean {
  const box = el.getBoundingClientRect();
  const start = axis === "x" ? box.left : box.top;
  const end = axis === "x" ? box.right : box.bottom;
  if (end - start < EDGE * 3) return false;
  let step = 0;
  if (pos < start + EDGE) step = -Math.ceil(SPEED * Math.min(1, (start + EDGE - pos) / EDGE));
  else if (pos > end - EDGE) step = Math.ceil(SPEED * Math.min(1, (pos - end + EDGE) / EDGE));
  if (step === 0) return false;
  const before = axis === "x" ? el.scrollLeft : el.scrollTop;
  if (axis === "x") el.scrollLeft += step;
  else el.scrollTop += step;
  return (axis === "x" ? el.scrollLeft : el.scrollTop) !== before;
}

/** The nearest element around `el` that scrolls up and down, if any. */
export function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let at = el.parentElement; at; at = at.parentElement) {
    const { overflowY } = getComputedStyle(at);
    if ((overflowY === "auto" || overflowY === "scroll") && at.scrollHeight > at.clientHeight) return at;
  }
  return null;
}
