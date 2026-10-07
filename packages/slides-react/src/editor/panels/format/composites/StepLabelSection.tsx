import { Row, TextField } from "../controls.tsx";
import type { SectionProps } from "../types.ts";
import { only, shared } from "../values.ts";
import { patchEach } from "../write.ts";
import { CompositeSection } from "./CompositeSection.tsx";

/** "Step n / N": the words it is written in. */
export function StepLabelSection({ session, ui, elements }: SectionProps) {
  const labels = only(elements, "step-label");
  const format = shared(labels.map((l) => l.format ?? ""), "");

  return (
    <CompositeSection id="step-label" title="Step label" ui={ui} ids={labels.map((l) => l.id)}>
      <Row label="Wording" wide>
        <div data-primary="">
          <TextField
            label="Step label wording"
            value={format.value}
            mixed={format.mixed}
            placeholder="Step {n} / {total}"
            onCommit={(text) => patchEach(session, labels, () => ({ format: text.trim() === "" ? null : text }))}
          />
        </div>
      </Row>
      <p className="ks-sp-hint">
        {"{n}"} is the step and {"{total}"} how many there are. This is how it reads in the editor and in PowerPoint; presenting uses the deck's own wording.
      </p>
    </CompositeSection>
  );
}
