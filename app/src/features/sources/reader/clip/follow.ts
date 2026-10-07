// Following a pointer from a press to its end. The window hears the moves and
// the release wherever the pointer goes, in the capture phase so a box or a
// layer that stops pointerup from going up cannot keep a drag from ending. Near
// the edge of the scroller the pages are scrolled, frame by frame, so a box can
// be drawn past what is in view.

import { nudge } from "../../../../ui/pointer-drag";

/** What a pointer event and a press both carry. */
export interface Pointer {
  clientX: number;
  clientY: number;
}

export interface Following {
  /** Stops following without saying the drag ended. */
  stop(): void;
}

/**
 * Calls `move` with the pointer at every move, and at every frame the scroller moves while the pointer rests near its
 * edge. Calls `end` once when the button is let go or the pointer is taken away. `scroller` may be null: nothing scrolls.
 */
export function follow(scroller: HTMLElement | null, first: Pointer, move: (pointer: Pointer) => void, end: () => void): Following {
  let pointer: Pointer = first;
  let frame = 0;

  const scroll = () => {
    frame = 0;
    if (!scroller) return;
    // Both axes, so a pointer in a corner scrolls both.
    const down = nudge(scroller, "y", pointer.clientY);
    const along = nudge(scroller, "x", pointer.clientX);
    if (!down && !along) return;
    move(pointer);
    frame = requestAnimationFrame(scroll);
  };
  const onMove = (event: PointerEvent) => {
    // A move with no button held: it was let go where the window could not hear it (another window, another app).
    if (event.buttons === 0) return onEnd();
    pointer = event;
    move(event);
    if (!frame && scroller && typeof requestAnimationFrame === "function") frame = requestAnimationFrame(scroll);
  };
  const stop = () => {
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onEnd, true);
    window.removeEventListener("pointercancel", onEnd, true);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
  const onEnd = () => {
    stop();
    end();
  };
  window.addEventListener("pointermove", onMove, true);
  window.addEventListener("pointerup", onEnd, true);
  window.addEventListener("pointercancel", onEnd, true);
  return { stop };
}
