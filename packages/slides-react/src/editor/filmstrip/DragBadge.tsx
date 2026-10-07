import type { JSX, RefObject } from "react";

import type { Drag } from "./reorder.ts";
import "./thumb.css";

/** How many slides are in the hand while several are dragged; it follows the pointer (the drag moves it). */
export function DragBadge({ drag, badge }: { drag: Drag | null; badge: RefObject<HTMLDivElement | null> }): JSX.Element | null {
  if (!drag || drag.ids.length < 2) return null;
  return (
    <div ref={badge} className="ks-drag-badge" aria-hidden="true">
      {drag.ids.length} slides
    </div>
  );
}
