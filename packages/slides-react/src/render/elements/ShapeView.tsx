import type { JSX } from "react";

import { colorOf, fontStack, placeholderOf } from "../../theme/index.ts";
import type { ViewProps } from "../context.ts";
import { isPresetShape, textRect } from "../shapes/index.ts";
import { isBlankText } from "../text-props.ts";
import { ShapeGraphic } from "./ShapeGraphic.tsx";
import { TextArea } from "./TextArea.tsx";
import { Upright } from "./Upright.tsx";

/** A preset shape with the text inside it, if it has any. */
export function ShapeView({ element, box, cx, hideText }: ViewProps<"shape">): JSX.Element {
  const { theme } = cx;
  const slot = placeholderOf(theme, cx.layout, element);
  const known = isPresetShape(element.shape);
  const radius = element.style?.radius;
  const text = element.text;
  // The text goes in the part of the shape that its outline leaves room for; a flipped shape flips that part with it.
  const area = textRect(element.shape, box.w, box.h, radius);
  const muted = colorOf(theme, "text2", 0.7);
  return (
    <>
      <ShapeGraphic theme={theme} style={element.style} name={element.shape} w={box.w} h={box.h} adjust={radius} />
      {!known && (
        <div className="ks-unknown" style={{ borderColor: muted, color: muted, fontFamily: fontStack(theme, "body") }}>
          <span>{element.shape}</span>
        </div>
      )}
      {text && !hideText && (
        <div className="ks-text-rect" style={{ left: area.x, top: area.y, width: area.w, height: area.h }}>
          <Upright flipH={element.flipH} flipV={element.flipV}>
            <TextArea
              cx={cx}
              text={text}
              baseStyle={slot?.style ?? "body"}
              width={area.w}
              height={area.h}
              valign={text.valign ?? slot?.valign ?? "middle"}
              prompt={cx.mode === "edit" && isBlankText(text) ? slot?.prompt : undefined}
            />
          </Upright>
        </div>
      )}
    </>
  );
}
