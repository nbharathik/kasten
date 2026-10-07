import type { Element } from "@kasten-slides/wasm";

import type { EditorSession } from "../../session/session.ts";
import { NumberField } from "../../ui/Fields.tsx";
import { Row } from "./controls.tsx";
import { PanelSection } from "./PanelSection.tsx";
import type { SectionProps } from "./types.ts";
import { agree, round1 } from "./values.ts";
import { styleEach } from "./write.ts";

/** How round the corners of a rounded rectangle are: a sixth of its shorter side until a number says otherwise. */
function cornerOf(session: EditorSession, element: Element): number {
  const box = session.elements.boxOf(element);
  return element.style?.radius ?? (box ? Math.min(box.w, box.h) / 6 : 0);
}

export function RadiusSection({ session, elements }: SectionProps) {
  const radius = agree(elements.map((e) => round1(cornerOf(session, e))), 0);
  return (
    <PanelSection id="radius" title="Corner radius">
      <Row label="Radius">
        <span className="ks-sp-plain">
          <NumberField label="Radius" unit="px" min={0} max={400} decimals={1} width={64} value={radius} onCommit={(value) => styleEach(session, elements, () => ({ radius: value }))} />
        </span>
      </Row>
    </PanelSection>
  );
}
