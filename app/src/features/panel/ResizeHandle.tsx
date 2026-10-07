// The panel's left edge: drag to resize, arrow keys when focused,
// double-click for the default width. The width is kept on release. In a
// narrow pane the panel shows less than it asks for (PANEL_SHARE): moves
// start from what shows, and reaching that limit keeps the wider width
// asked for, for when the pane is wide again.

import { useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { PANEL_SHARE, PANEL_WIDTH, usePanel, usePanelWidth } from "./panel-store";

/** The widest the panel beside `handle` shows, from its page's width. */
function limitOf(handle: HTMLElement): number {
  const page = handle.closest(".kasten-side-panel")?.parentElement?.clientWidth ?? 0;
  return page > 0 ? page * PANEL_SHARE : PANEL_WIDTH.max;
}

export function ResizeHandle({ pane }: { pane: string }) {
  const width = usePanelWidth(pane);
  const [dragging, setDragging] = useState(false);
  /** `next`, or at the limit the wider width already asked for. */
  const kept = (next: number, limit: number) => (next >= limit ? Math.max(width, next) : next);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const limit = limitOf(event.currentTarget);
    const startX = event.clientX;
    const startWidth = Math.min(width, limit);
    let last = width;
    setDragging(true);
    document.body.classList.add("kasten-resizing");
    // Followed on the window, so the drag goes on wherever the pointer is.
    // The panel sits on the right, so moving left widens it.
    const move = (e: PointerEvent) => {
      last = kept(startWidth + startX - e.clientX, limit);
      usePanel.getState().setWidth(pane, last);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      document.body.classList.remove("kasten-resizing");
      setDragging(false);
      usePanel.getState().setWidth(pane, last, true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const limit = limitOf(event.currentTarget);
    const shown = Math.min(width, limit);
    const step = event.shiftKey ? 48 : 16;
    const next = { ArrowLeft: shown + step, ArrowRight: shown - step, Home: PANEL_WIDTH.min, End: PANEL_WIDTH.max }[event.key];
    if (next === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    usePanel.getState().setWidth(pane, kept(next, limit), true);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the panel"
      aria-valuemin={PANEL_WIDTH.min}
      aria-valuemax={PANEL_WIDTH.max}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      className={`kasten-panel-resize${dragging ? " is-dragging" : ""}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => usePanel.getState().setWidth(pane, PANEL_WIDTH.initial, true)}
    />
  );
}
