import type { CitationStyle } from "@kasten-slides/wasm";
import { type JSX, useId, useState } from "react";

import { addReferenceList, citeOnSlide } from "../citations/cite.ts";
import { ReferenceList } from "../citations/ReferenceList.tsx";
import { useReferences } from "../citations/use-references.ts";
import { parseKeys } from "../panels/format/composites/citation-keys.ts";
import { TextButton } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Segmented } from "../ui/Fields.tsx";
import type { DialogProps } from "./types.ts";
import "./dialogs.css";

const STYLES: { value: CitationStyle; label: string; title: string }[] = [
  { value: "short", label: "Short", title: "Author, year and venue: Vaswani et al., 2017 (NeurIPS)" },
  { value: "numbered", label: "Numbered", title: "The number the deck gives the work: [1]" },
  { value: "full", label: "Full", title: "The whole reference, a line for each work" },
];

/**
 * Cites works on the shown slide. The works come from the bibliography the host gave: search them by key, author,
 * title or year and choose as many as you like; keys can also be typed. "Add to the slide" puts them in the slide's footer;
 * "Add as a list" makes a list of every work the deck cites, for a references slide.
 */
export function CitationDialog({ session, onClose }: DialogProps): JSX.Element {
  const works = useReferences();
  const [picked, setPicked] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [format, setFormat] = useState<CitationStyle | null>(null);
  const uid = useId();

  const keys = [...new Set([...picked, ...parseKeys(typed)])];
  const toggle = (key: string) => setPicked((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));

  const add = () => {
    if (keys.length === 0) return;
    onClose();
    citeOnSlide(session, keys, format ?? undefined);
  };
  const list = () => {
    onClose();
    addReferenceList(session, keys);
  };
  const enter = (event: { key: string; preventDefault(): void }) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  };

  return (
    <Dialog
      title="Insert citation"
      width={560}
      onClose={onClose}
      footer={
        <>
          <TextButton className="ks-dg-left" onClick={list} title="Print every work the deck cites, numbered, for a references slide">
            Add as a list
          </TextButton>
          <TextButton onClick={onClose}>Cancel</TextButton>
          <TextButton primary onClick={add} disabled={keys.length === 0}>
            Add to the slide
          </TextButton>
        </>
      }
    >
      <div className="ks-dg-form">
        {works && works.length > 0 ? (
          <ReferenceList works={works} chosen={new Set(picked)} onToggle={toggle} label="References" focus />
        ) : (
          <p className="ks-dg-note">
            {works === null ? "This place has no bibliography, so the works cannot be listed." : "The bibliography has no works in it yet: add a .bib file."} Type the keys you want to cite below.
          </p>
        )}
        <div className="ks-dg-field">
          <label className="ks-dg-label" htmlFor={`${uid}-keys`}>
            {works && works.length > 0 ? "More keys, separated by commas" : "Keys, separated by commas"}
          </label>
          <input
            id={`${uid}-keys`}
            className="ks-input"
            autoComplete="off"
            spellCheck={false}
            placeholder="vaswani2017attention, devlin2019bert"
            data-autofocus={works && works.length > 0 ? undefined : ""}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={enter}
          />
        </div>
        <div className="ks-dg-field">
          <span className="ks-dg-label">Style</span>
          <Segmented<CitationStyle> label="Citation style" value={format ?? "short"} options={STYLES} onPick={setFormat} />
        </div>
        <p className="ks-dg-note" role="status">
          {keys.length === 0 ? "Choose the works to cite." : `${keys.length} ${keys.length === 1 ? "work" : "works"} chosen: ${keys.join(", ")}.`}
        </p>
      </div>
    </Dialog>
  );
}
