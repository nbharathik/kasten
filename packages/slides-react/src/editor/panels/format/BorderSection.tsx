import type { Dash, Stroke } from "@kasten-slides/wasm";

import { dashArray } from "../../../render/style.ts";
import { TextButton } from "../../ui/Button.tsx";
import { NumberField, Segmented } from "../../ui/Fields.tsx";
import { ColorButton, Row, Slider } from "./controls.tsx";
import { PanelSection } from "./PanelSection.tsx";
import type { SectionProps } from "./types.ts";
import { agree } from "./values.ts";
import { strokePatch, styleEach } from "./write.ts";

const DASHES: { value: Dash; title: string }[] = [
  { value: "solid", title: "Solid" },
  { value: "dash", title: "Dash" },
  { value: "dot", title: "Dot" },
  { value: "dashDot", title: "Dash dot" },
  { value: "longDash", title: "Long dash" },
];

/** A short line drawn in a dash pattern, to tell the choices apart. */
function DashSample({ dash }: { dash: Dash }) {
  return (
    <svg width={26} height={8} viewBox="0 0 26 8" aria-hidden="true">
      <line x1={1} x2={25} y1={4} y2={4} stroke="currentColor" strokeWidth={1.5} strokeDasharray={dashArray(dash, 1.5)} />
    </svg>
  );
}

/** The outline of a shape, a text box or a picture, or the line itself for a line and a connector. */
export function BorderSection({ session, elements, theme }: SectionProps) {
  const linesOnly = elements.every((e) => e.type === "line" || e.type === "connector");
  const strokes = elements.map((e) => e.style?.stroke ?? null);
  const drawn = strokes.filter((stroke): stroke is Stroke => stroke !== null);
  const colour = agree(strokes.map((stroke) => stroke?.color ?? null), null);
  const weight = agree(drawn.map((stroke) => stroke.width ?? 1), 0);
  const dash = agree(drawn.map((stroke) => stroke.dash ?? "solid"), "solid");
  const opacity = agree(drawn.map((stroke) => Math.round((stroke.alpha ?? 1) * 100)), 100);
  return (
    <PanelSection id="border" title={linesOnly ? "Line" : "Border"}>
      <Row label="Colour">
        <ColorButton
          theme={theme}
          label={linesOnly ? "Line colour" : "Border colour"}
          value={colour}
          onPick={(picked) => styleEach(session, elements, (element) => (picked === null ? (element.style?.stroke ? { stroke: null } : null) : strokePatch(element, { color: picked })))}
        />
        <TextButton disabled={drawn.length === 0} onClick={() => styleEach(session, elements, (element) => (element.style?.stroke ? { stroke: null } : null))}>
          None
        </TextButton>
      </Row>
      <Row label="Weight">
        <span className="ks-sp-plain">
          <NumberField label="Weight" unit="px" min={0} max={24} step={1} decimals={1} width={56} value={weight} onCommit={(width) => styleEach(session, elements, (element) => strokePatch(element, { width }))} />
        </span>
      </Row>
      <Row label="Dash">
        <Segmented
          label="Dash"
          value={drawn.length === 0 ? null : dash}
          options={DASHES.map(({ value, title }) => ({ value, title, label: <DashSample dash={value} /> }))}
          onPick={(picked) => styleEach(session, elements, (element) => strokePatch(element, { dash: picked === "solid" ? null : picked }))}
        />
      </Row>
      <Row label="Opacity">
        <Slider
          label="Border opacity"
          value={opacity}
          disabled={drawn.length === 0}
          onCommit={(percent) => styleEach(session, elements, (element) => (element.style?.stroke ? strokePatch(element, { alpha: percent >= 100 ? null : percent / 100 }) : null))}
        />
      </Row>
    </PanelSection>
  );
}
