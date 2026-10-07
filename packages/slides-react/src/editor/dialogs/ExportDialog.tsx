import { type JSX, useState } from "react";

import { DEFAULT_PRINT, type PrintOptions } from "../../export/print.tsx";
import { TextButton } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Segmented, Toggle } from "../ui/Fields.tsx";
import type { DialogProps } from "./types.ts";
import "./dialogs.css";

/**
 * Print, or save as PDF: which pages, and whether the speaker notes come with them. The
 * browser's own print dialog follows, with "Save as PDF" among its destinations, so the
 * text in the file stays text.
 */
export function ExportDialog({ ui, onClose }: DialogProps): JSX.Element {
  const [steps, setSteps] = useState<PrintOptions["steps"]>(DEFAULT_PRINT.steps);
  const [notes, setNotes] = useState(DEFAULT_PRINT.notes);
  const print = () => {
    onClose();
    ui.actions.print?.({ steps, notes });
  };
  return (
    <Dialog
      title="Print or save as PDF"
      width={420}
      onClose={onClose}
      footer={
        <>
          <TextButton onClick={onClose}>Cancel</TextButton>
          <TextButton primary onClick={print} data-autofocus="" disabled={ui.actions.print === undefined}>
            Print…
          </TextButton>
        </>
      }
    >
      <div className="ks-dg-form">
        <div className="ks-dg-field">
          <span className="ks-dg-label">Pages</span>
          <Segmented<PrintOptions["steps"]>
            label="Pages"
            value={steps}
            options={[
              { value: "final", label: "Each slide once", title: "Each slide once, as it ends" },
              { value: "each", label: "Every step", title: "A page for every step of a slide that has steps" },
            ]}
            onPick={setSteps}
          />
        </div>
        <Toggle label="Speaker notes under each slide (handout)" on={notes} onChange={setNotes} />
        <p className="ks-sp-hint">Choose “Save as PDF” as the destination to make a file. Hidden slides are left out.</p>
      </div>
    </Dialog>
  );
}
