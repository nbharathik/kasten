// Which ends of a sideways-scrolling row have more beyond them, so the row
// can fade there and show that it scrolls.

import { useEffect, useState, type RefObject } from "react";

export interface Edges {
  /** More to the left. */
  start: boolean;
  /** More to the right. */
  end: boolean;
}

const NONE: Edges = { start: false, end: false };

/** The clipped ends of `row`, updated as it scrolls, resizes or changes. */
export function useScrollEdges(row: RefObject<HTMLElement | null>, content: unknown): Edges {
  const [edges, setEdges] = useState<Edges>(NONE);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((was) => (was.start === start && was.end === end ? was : { start, end }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const sized = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    sized?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      sized?.disconnect();
    };
  }, [row, content]);
  return edges;
}
