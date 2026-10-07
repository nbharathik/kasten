import { renderMath } from "../../../../render/math.ts";
import { MATH_POINTS } from "../../../../render/math.ts";
import type { Patch } from "../../../session/elements.ts";
import { TextButton } from "../../../ui/Button.tsx";
import { NumberField } from "../../../ui/Fields.tsx";
import { ColorButton, Row, TriToggle } from "../controls.tsx";
import type { SectionProps } from "../types.ts";
import { agree, only, shared } from "../values.ts";
import { patchEach } from "../write.ts";
import { CodeArea } from "./CodeArea.tsx";
import { CompositeSection } from "./CompositeSection.tsx";

/** A formula: its LaTeX, whether it is set within a line, and its colour and size. */
export function MathSection({ session, ui, theme, elements }: SectionProps) {
  const formulas = only(elements, "math");
  const latex = shared(formulas.map((f) => f.latex), "");
  const inline = agree(formulas.map((f) => Boolean(f.inline)), false);
  const color = agree<string | null>(formulas.map((f) => f.color ?? null), null);
  const size = agree(formulas.map((f) => f.fontSize ?? MATH_POINTS), MATH_POINTS);
  const change = (patch: Patch) => patchEach(session, formulas, () => patch);
  // What is wrong with the LaTeX that is in the deck, in words for a person; the first formula that has a fault says.
  const fault = formulas.flatMap((f) => {
    const drawn = f.latex.trim() === "" ? null : renderMath(f.latex, f.inline === true, "html");
    return drawn && !drawn.ok ? [drawn.message] : [];
  })[0];

  return (
    <CompositeSection id="formula" title="Formula" ui={ui} ids={formulas.map((f) => f.id)}>
      <CodeArea label="LaTeX" value={latex.value} mixed={latex.mixed} primary code tabs={false} rows={4} invalid={fault !== undefined} placeholder="E = mc^2" onCommit={(text) => change({ latex: text })} />
      {fault !== undefined ? (
        <p className="ks-sp-hint is-error" role="status">
          This cannot be drawn: {fault}
        </p>
      ) : null}
      <TriToggle label="Inline (smaller, set within a line)" on={inline} onChange={(on) => change({ inline: on })} />
      <Row label="Colour">
        <ColorButton theme={theme} label="Formula colour" value={color} noneLabel="Text colour" emptyName="Text colour" onPick={(picked) => change({ color: picked })} />
      </Row>
      <Row label="Size">
        <span className="ks-sp-plain">
          <NumberField label="Formula size" unit="pt" min={6} max={400} decimals={1} width={64} value={size} onCommit={(n) => change({ fontSize: n === MATH_POINTS ? null : n })} />
        </span>
        <TextButton aria-label="Reset formula size" disabled={size === MATH_POINTS} onClick={() => change({ fontSize: null })}>
          Reset
        </TextButton>
      </Row>
    </CompositeSection>
  );
}
