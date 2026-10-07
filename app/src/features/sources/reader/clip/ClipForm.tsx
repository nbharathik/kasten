// What is asked of a person once a figure is boxed: the paper's citation key
// (chosen from the bibliography or typed) and a caption if wanted, then "Save
// to gallery". It floats under the box; Escape puts the box away.

import { useEffect, useRef } from "react";

import type { Work } from "./bib";
import { keyProblem } from "./clip-file";
import { DPI } from "./crop";
import { KeyField } from "./KeyField";

/** The longest a caption is when typed here (the vault keeps up to 2000). */
const CAPTION_MAX = 300;

interface Props {
  /** Where it sits, in the pages' scroll area: the middle of its top edge. */
  at: { left: number; top: number };
  paper: string;
  page: number;
  /** The picture's size at 300 dpi. */
  pixels: { width: number; height: number };
  /** Why the picture cannot be made, if it cannot. */
  problem: string | null;
  works: readonly Work[];
  keyText: string;
  onKey(key: string): void;
  caption: string;
  onCaption(caption: string): void;
  saving: boolean;
  onSave(): void;
  onCancel(): void;
}

export function ClipForm({ at, paper, page, pixels, problem, works, keyText, onKey, caption, onCaption, saving, onSave, onCancel }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const key = useRef<HTMLInputElement>(null);
  const words = useRef<HTMLInputElement>(null);

  // It opens on the field that still needs an answer, and shows itself whole.
  useEffect(() => {
    const field = keyText.trim() ? words.current : key.current;
    field?.focus({ preventScroll: true });
    form.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    // Only as it opens: typing must not move the focus.
  }, []);

  const blocked = saving || problem !== null || keyProblem(keyText) !== null;
  return (
    <form
      ref={form}
      className="kasten-clip-form"
      role="dialog"
      aria-label="Save this figure"
      style={{ left: at.left, top: at.top }}
      onPointerUp={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) onSave();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
    >
      <p className="kasten-clip-head">
        <strong title={paper}>{paper}</strong>
        <span>page {page}</span>
      </p>
      {problem ? (
        <p className="kasten-clip-note is-problem" role="alert">
          {problem}
        </p>
      ) : (
        <p className="kasten-clip-size">
          {pixels.width} × {pixels.height} px at {DPI} dpi
        </p>
      )}
      <div className="kasten-clip-label">
        <span>Citation key</span>
        <KeyField works={works} value={keyText} onChange={onKey} inputRef={key} />
      </div>
      <label className="kasten-clip-label">
        <span>Caption</span>
        <input ref={words} type="text" aria-label="Caption" placeholder="Optional. It becomes the picture's alt text." maxLength={CAPTION_MAX} value={caption} onChange={(event) => onCaption(event.target.value)} />
      </label>
      <div className="kasten-clip-actions">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="kasten-clip-save" disabled={blocked}>
          {saving ? "Saving…" : "Save to gallery"}
        </button>
      </div>
    </form>
  );
}
