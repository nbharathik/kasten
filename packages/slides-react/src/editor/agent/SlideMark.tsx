import type { Slide } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { Icon } from "../ui/Icon.tsx";
import { batchesOf, markedOn } from "./marks.ts";
import "./agent.css";

/**
 * The mark on a slide in the filmstrip that holds elements an assistant made or changed and nobody has accepted:
 * a star in the corner, with the number in its words for a screen reader and its tooltip. Nothing is drawn for a slide with none.
 */
export function SlideMark({ slide }: { slide: Slide }): JSX.Element | null {
  const count = markedOn(slide);
  if (count === 0) return null;
  const by = [...new Set(batchesOf(slide).map((batch) => batch.by))].join(", ");
  const words = `${count} ${count === 1 ? "element" : "elements"} made by ${by}, not accepted yet`;
  return (
    <span className="ks-agent-mark" role="img" aria-label={words} title={words}>
      <Icon name="sparkles" size={12} />
    </span>
  );
}
