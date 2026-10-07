import type { Slide } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { Icon } from "../ui/Icon.tsx";
import { madeBy, shownMarks } from "./marks.ts";
import "./agent.css";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far in from the corner of an element its badge sits, in pixels on screen. */
const INSET = 4;

/**
 * A small badge on each element an assistant made or changed and nobody has accepted or changed since. It is drawn
 * in screen pixels at the top right corner of the element, in a colour of its own (`--ks-agent`) with a ring in the
 * canvas colour, so it reads on any slide, whatever the deck's theme. Each is an image with words for a screen reader:
 * who made it and when. Accepting is in the context menu and the Tools menu.
 */
export function AgentBadges({ slide, boxes, zoom }: { slide: Slide; boxes: ReadonlyMap<string, Box>; zoom: number }): JSX.Element | null {
  const marks = shownMarks(slide);
  if (marks.size === 0) return null;
  const now = Date.now();
  return (
    <div className="ks-agent-layer">
      {[...marks].map(([id, batch]) => {
        const box = boxes.get(id);
        if (!box) return null;
        const words = madeBy(batch, now);
        return (
          <span
            key={id}
            className="ks-agent-badge"
            data-agent-badge={id}
            role="img"
            aria-label={`${words}. Not accepted yet.`}
            title={`${words}. Accept it from the right-click menu, or change it.`}
            style={{ left: (box.x + box.w) * zoom - INSET, top: box.y * zoom + INSET }}
          >
            <Icon name="sparkles" size={12} />
          </span>
        );
      })}
    </div>
  );
}
