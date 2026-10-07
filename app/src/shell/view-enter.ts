// A view fades in as a pane moves to it, so the change reads as one step
// rather than a flash. The first view of a pane shows at once, typing
// never triggers it, and it takes no time while motion is off.

import { useLayoutEffect, useRef, type RefObject } from "react";

import { motionMs } from "../lib/motion";

/** How long the fade takes, in milliseconds. */
export const VIEW_FADE_MS = 120;

export function useViewEnter(element: RefObject<HTMLElement | null>, place: string): void {
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = element.current;
    const ms = motionMs(VIEW_FADE_MS);
    if (!el || ms === 0 || typeof el.animate !== "function") return;
    const fade = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    return () => fade.cancel();
  }, [element, place]);
}
