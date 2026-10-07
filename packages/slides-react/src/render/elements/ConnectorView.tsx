import type { JSX } from "react";

import type { ViewProps } from "../context.ts";
import { LABEL_STYLE, labelBox } from "../label-box.ts";
import { centeredText, isBlankText } from "../text-props.ts";
import { LineGraphic } from "./LineGraphic.tsx";
import { TextArea } from "./TextArea.tsx";
import { Upright } from "./Upright.tsx";

/** A line between two elements, and its label on a chip of the slide's own colour at the midpoint. */
export function ConnectorView({ element, box, cx, hideText }: ViewProps<"connector">): JSX.Element {
  const label = element.label;
  const showLabel = label && !hideText && !isBlankText(label);
  const chip = showLabel ? labelBox(cx.theme, label) : null;
  return (
    <>
      <LineGraphic theme={cx.theme} style={element.style} route={element.route} w={box.w} h={box.h} />
      {label && chip && (
        <Upright flipH={element.flipH} flipV={element.flipV}>
          <div
            className="ks-label"
            style={{ left: box.w / 2 - chip.w / 2, top: box.h / 2 - chip.h / 2, width: chip.w, height: chip.h, background: cx.paper }}
          >
            <TextArea cx={cx} text={centeredText(label)} baseStyle={LABEL_STYLE} width={chip.w} height={chip.h} valign={label.valign ?? "middle"} />
          </div>
        </Upright>
      )}
    </>
  );
}
