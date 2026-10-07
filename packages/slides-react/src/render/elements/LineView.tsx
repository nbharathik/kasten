import type { JSX } from "react";

import type { ViewProps } from "../context.ts";
import { LineGraphic } from "./LineGraphic.tsx";

/** A free line or arrow. */
export function LineView({ element, box, cx }: ViewProps<"line">): JSX.Element {
  return <LineGraphic theme={cx.theme} style={element.style} route={element.route} w={box.w} h={box.h} />;
}
