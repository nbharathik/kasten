import type { Arrow } from "@kasten-slides/wasm";

import { Row, SelectField } from "./controls.tsx";
import { PanelSection } from "./PanelSection.tsx";
import type { SectionProps } from "./types.ts";
import { agree } from "./values.ts";
import { styleEach } from "./write.ts";

const HEADS: { value: Arrow; label: string }[] = [
  { value: "none", label: "None" },
  { value: "triangle", label: "Arrow" },
  { value: "stealth", label: "Stealth arrow" },
  { value: "open", label: "Open arrow" },
  { value: "oval", label: "Circle" },
  { value: "diamond", label: "Diamond" },
];

/** What the two ends of a line look like. */
export function ArrowsSection({ session, elements }: SectionProps) {
  const end = (key: "startArrow" | "endArrow", label: string) => (
    <Row label={label}>
      <SelectField
        label={`${label} arrowhead`}
        value={agree(elements.map((e) => e.style?.[key] ?? "none"), "none")}
        options={HEADS}
        // "None" is a missing arrow, not a stored one.
        onPick={(head) => styleEach(session, elements, () => ({ [key]: head === "none" ? null : head }))}
      />
    </Row>
  );
  return (
    <PanelSection id="arrows" title="Arrowheads">
      {end("startArrow", "Start")}
      {end("endArrow", "End")}
    </PanelSection>
  );
}
