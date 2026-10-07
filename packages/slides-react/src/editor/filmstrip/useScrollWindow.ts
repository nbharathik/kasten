import { type RefObject, useLayoutEffect, useState } from "react";

/** Which part of a scroller can be seen: how far it is scrolled and how tall it is. */
export interface ScrollWindow {
  top: number;
  height: number;
}

/** What is assumed of a scroller that reports no height, such as one in a test. */
export const FALLBACK_HEIGHT = 900;

/**
 * The scroller's window on its content, kept up to date as it scrolls and is
 * resized. The top is rounded down to a multiple of `step`, so that a long
 * scroll does not draw again at every pixel.
 */
export function useScrollWindow(ref: RefObject<HTMLElement | null>, step = 48): ScrollWindow {
  const [viewport, setViewport] = useState<ScrollWindow>({ top: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame: number | undefined;
    const read = () => {
      frame = undefined;
      const top = Math.floor(element.scrollTop / step) * step;
      const height = element.clientHeight;
      setViewport((now) => (now.top === top && now.height === height ? now : { top, height }));
    };
    const later = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(read);
    };
    read();
    element.addEventListener("scroll", later, { passive: true });
    const watcher = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(later);
    watcher?.observe(element);
    return () => {
      element.removeEventListener("scroll", later);
      watcher?.disconnect();
      if (frame !== undefined) window.cancelAnimationFrame(frame);
    };
  }, [ref, step]);
  return viewport;
}

/** Whether something from `top` for `height` is near enough the window to be worth drawing in full. */
export function nearWindow(viewport: ScrollWindow, top: number, height: number, margin: number): boolean {
  const seen = viewport.height > 0 ? viewport.height : FALLBACK_HEIGHT;
  return top + height >= viewport.top - margin && top <= viewport.top + seen + margin;
}
