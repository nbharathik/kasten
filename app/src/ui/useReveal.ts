// Long lists draw in steps: the first rows at once, and the next ones as
// the reader nears the end. Rows may be any height, which windowing by a
// fixed row height cannot handle, and a list of thousands opens as fast as
// a short one (the journal's day list does the same).

import { useEffect, useRef, useState, type RefObject } from "react";

export const STEP = 200;

/** How many of `total` rows to draw, and the element to put after them:
 * when it comes within a screen or so of the view, `step` more are drawn. */
export function useReveal(total: number, step = STEP): { shown: number; more: RefObject<HTMLDivElement | null> } {
  const [limit, setLimit] = useState(step);
  const more = useRef<HTMLDivElement | null>(null);
  const shown = Math.min(limit, total);

  useEffect(() => {
    const sentinel = more.current;
    if (!sentinel || typeof IntersectionObserver === "undefined" || shown >= total) return;
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setLimit((n) => n + step), {
      rootMargin: "800px 0px",
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [shown, total, step]);

  return { shown, more };
}
