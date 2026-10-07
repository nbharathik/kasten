// The edge of a panel that sets its width, as a window splitter: drag it,
// or focus it and use the arrow keys (with Shift for bigger steps, Home and
// End for the limits). A double-click goes back to the usual width. The
// width follows the pointer while dragging and is kept when it lets go.

import { useRef } from "react";

interface Props {
  label: string;
  /** The panel's edge the handle sits on: on the right edge, moving right widens it. */
  edge: "left" | "right";
  width: number;
  min: number;
  max: number;
  /** The usual width, for a double-click. */
  initial: number;
  /** Each new width while dragging or stepping. */
  onChange(width: number): void;
  /** The width to keep, once a drag, a key or a double-click is done. */
  onCommit(width: number): void;
}

/** Arrow-key steps, in pixels. */
export const STEP = 16;
export const BIG_STEP = 64;

export function ResizeHandle({ label, edge, width, min, max, initial, onChange, onCommit }: Props) {
  const drag = useRef<{ x: number; width: number; last: number } | null>(null);
  const clamp = (w: number) => Math.round(Math.max(min, Math.min(max, w)));
  const set = (w: number) => {
    const next = clamp(w);
    onChange(next);
    onCommit(next);
  };
  const end = (el: HTMLElement) => {
    const done = drag.current;
    if (!done) return;
    drag.current = null;
    el.classList.remove("is-dragging");
    document.body.classList.remove("kasten-resizing");
    onCommit(done.last);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label}: drag, or double-click for the usual width`}
      className={`kasten-resize is-${edge}`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.currentTarget.classList.add("is-dragging");
        document.body.classList.add("kasten-resizing");
        drag.current = { x: e.clientX, width, last: width };
      }}
      onPointerMove={(e) => {
        const start = drag.current;
        if (!start) return;
        const moved = e.clientX - start.x;
        start.last = clamp(start.width + (edge === "right" ? moved : -moved));
        onChange(start.last);
      }}
      onPointerUp={(e) => end(e.currentTarget)}
      onPointerCancel={(e) => end(e.currentTarget)}
      onDoubleClick={() => set(initial)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? BIG_STEP : STEP;
        const grow = edge === "right" ? "ArrowRight" : "ArrowLeft";
        const shrink = edge === "right" ? "ArrowLeft" : "ArrowRight";
        const next = e.key === grow ? width + step : e.key === shrink ? width - step : e.key === "Home" ? min : e.key === "End" ? max : null;
        if (next === null) return;
        e.preventDefault();
        set(next);
      }}
    />
  );
}
