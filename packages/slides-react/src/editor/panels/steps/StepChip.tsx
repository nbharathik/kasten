import type { JSX } from "react";

import "./steps.css";

/** On the canvas while a step is previewed: which one, so the slide is never mistaken for how it is styled. */
export function StepChip({ step, steps }: { step: number; steps: number }): JSX.Element {
  return (
    <div className="ks-step-chip" role="status">
      {`Step ${step} of ${steps}`}
    </div>
  );
}
