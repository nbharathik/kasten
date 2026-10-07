import type { JSX } from "react";
import { useState } from "react";

import type { TransitionKind } from "@kasten-slides/wasm";

import { TextButton } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { NumberField, Segmented } from "../ui/Fields.tsx";
import { useEditor } from "../useEditor.ts";
import type { DialogProps } from "./types.ts";
import "./dialogs.css";

const KINDS: { value: TransitionKind; label: string }[] = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "morph", label: "Morph" },
];

/** How long a transition takes when the slide does not say. */
const USUAL: Record<TransitionKind, number> = { none: 0, fade: 0.4, slide: 0.4, morph: 0.6 };

/** How the slides arrive: the choice is kept for the slide shown, or for every slide. */
export function TransitionDialog({ session, onClose }: DialogProps): JSX.Element {
  const { deck, slideId } = useEditor(session);
  const now = deck.slides.find((s) => s.id === slideId)?.transition;
  const [kind, setKind] = useState<TransitionKind>(now?.kind ?? "none");
  const [seconds, setSeconds] = useState(now?.duration ?? USUAL[now?.kind ?? "none"]);

  const chosen = () => ({ kind, ...(kind === "none" ? {} : { duration: seconds }) });
  const apply = (everySlide: boolean) => {
    session.slides.setTransition(chosen(), everySlide ? deck.slides.map((s) => s.id) : [slideId]);
    onClose();
  };

  return (
    <Dialog
      title="Transition"
      width={400}
      onClose={onClose}
      footer={
        <>
          <TextButton className="ks-dg-left" onClick={() => apply(true)}>
            Apply to all slides
          </TextButton>
          <TextButton onClick={onClose}>Cancel</TextButton>
          <TextButton primary onClick={() => apply(false)}>
            Apply
          </TextButton>
        </>
      }
    >
      <div className="ks-dg-form">
        <div className="ks-dg-field">
          <span className="ks-dg-label">Kind</span>
          <Segmented<TransitionKind>
            label="Transition kind"
            value={kind}
            options={KINDS.map(({ value, label }) => ({ value, label, title: label }))}
            onPick={(picked) => {
              setKind(picked);
              setSeconds(USUAL[picked]);
            }}
          />
        </div>
        <NumberField label="Duration" unit="seconds" min={0} max={10} step={0.1} decimals={2} width={72} value={seconds} disabled={kind === "none"} onCommit={setSeconds} />
        <p className="ks-sp-hint">Morph moves elements that share an id from the slide before.</p>
      </div>
    </Dialog>
  );
}
