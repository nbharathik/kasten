import type { JSX } from "react";

import { placeholderOf } from "../../theme/index.ts";
import type { ViewProps } from "../context.ts";
import { paintsBox } from "../style.ts";
import { isBlankText } from "../text-props.ts";
import { ShapeGraphic } from "./ShapeGraphic.tsx";
import { TextArea } from "./TextArea.tsx";
import { Upright } from "./Upright.tsx";

/** A text box. Its style, which a plain box does not have, paints the box behind the words. */
export function TextView({ element, box, cx, hideText }: ViewProps<"text">): JSX.Element {
  const slot = placeholderOf(cx.theme, cx.layout, element);
  const radius = element.style?.radius ?? 0;
  return (
    <>
      {paintsBox(element.style) && (
        <ShapeGraphic theme={cx.theme} style={element.style} name={radius > 0 ? "roundRect" : "rect"} w={box.w} h={box.h} adjust={radius} />
      )}
      {!hideText && (
        <Upright flipH={element.flipH} flipV={element.flipV}>
          <TextArea
            cx={cx}
            text={element.text}
            baseStyle={slot?.style ?? "body"}
            width={box.w}
            height={box.h}
            valign={element.text.valign ?? slot?.valign ?? "top"}
            prompt={cx.mode === "edit" && isBlankText(element.text) ? slot?.prompt : undefined}
          />
        </Upright>
      )}
    </>
  );
}
