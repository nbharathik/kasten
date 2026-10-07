import { type JSX, useState } from "react";

import { DEFAULT_PNG, type PngOptions, type PngScale } from "../../export/png.ts";
import { pixelsOf } from "../../export/raster.ts";
import { TextButton } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Segmented } from "../ui/Fields.tsx";
import type { DialogProps } from "./types.ts";
import "./dialogs.css";

type Size = "1" | "2" | "4";

/**
 * Save slides as PNG pictures: which slides, how large, and whether a slide with
 * steps is one picture or one for each step. A slide by itself is one file; more
 * than one come in a zip file.
 */
export function PngDialog({ session, ui, onClose }: DialogProps): JSX.Element {
  const [scope, setScope] = useState<PngOptions["scope"]>(DEFAULT_PNG.scope);
  const [size, setSize] = useState<Size>(String(DEFAULT_PNG.scale) as Size);
  const [steps, setSteps] = useState<PngOptions["steps"]>(DEFAULT_PNG.steps);
  const scale = Number(size) as PngScale;
  const { w, h } = session.deck.size;
  const pixels = pixelsOf(w, h, scale);
  const save = () => {
    onClose();
    ui.actions.png?.({ scope, scale, steps });
  };
  return (
    <Dialog
      title="Save as PNG pictures"
      width={440}
      onClose={onClose}
      footer={
        <>
          <TextButton onClick={onClose}>Cancel</TextButton>
          <TextButton primary onClick={save} data-autofocus="" disabled={ui.actions.png === undefined}>
            Save
          </TextButton>
        </>
      }
    >
      <div className="ks-dg-form">
        <div className="ks-dg-field">
          <span className="ks-dg-label">Slides</span>
          <Segmented<PngOptions["scope"]>
            label="Slides"
            value={scope}
            options={[
              { value: "all", label: "All slides", title: "Every slide that is not hidden" },
              { value: "current", label: "This slide", title: "Only the slide being edited" },
            ]}
            onPick={setScope}
          />
        </div>
        <div className="ks-dg-field">
          <span className="ks-dg-label">Size</span>
          <Segmented<Size>
            label="Size"
            value={size}
            options={[
              { value: "1", label: "1×", title: `One pixel to a unit: ${Math.round(w)} pixels wide` },
              { value: "2", label: "2×", title: `Two pixels to a unit: ${Math.round(w * 2)} pixels wide` },
              { value: "4", label: "4×", title: `Four pixels to a unit: ${Math.round(w * 4)} pixels wide` },
            ]}
            onPick={setSize}
          />
          {pixels && <span className="ks-sp-hint">{`${pixels.w} × ${pixels.h} pixels`}</span>}
        </div>
        <div className="ks-dg-field">
          <span className="ks-dg-label">Steps</span>
          <Segmented<PngOptions["steps"]>
            label="Steps"
            value={steps}
            options={[
              { value: "final", label: "Each slide once", title: "Each slide once, as it ends" },
              { value: "each", label: "Every step", title: "A picture for every step of a slide that has steps" },
            ]}
            onPick={setSteps}
          />
        </div>
        <p className="ks-sp-hint">One picture is saved as a PNG file, several as a zip file of them. Hidden slides are left out.</p>
      </div>
    </Dialog>
  );
}
