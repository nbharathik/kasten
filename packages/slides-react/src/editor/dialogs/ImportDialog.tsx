import { type ImportMode, type ImportedPptx } from "@kasten-slides/wasm";
import { type DragEvent, type JSX, useEffect, useMemo, useState } from "react";

import { TextButton } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { ImportSummary } from "./ImportSummary.tsx";
import type { DialogProps } from "./types.ts";
import "./dialogs.css";
import "./import.css";

const ACCEPT = ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";

const MODES: { value: ImportMode; label: string; note: string }[] = [
  { value: "add", label: "Add to this deck", note: "The slides go at the end and take this deck's look: its theme stays." },
  { value: "replace", label: "Replace this deck", note: "This deck's slides and theme are replaced by the file's. Undo brings them back." },
  {
    value: "merge",
    label: "Import as a new version",
    note: "For a deck that was sent to PowerPoint and edited there: slides, boxes and words that are still in the file keep their place in this deck, what is new is added, and slides the file lacks stay.",
  },
];

interface Chosen {
  name: string;
  bytes: Uint8Array;
}

const messageOf = (thrown: unknown): string => (thrown instanceof Error ? thrown.message : String(thrown));

async function readFile(file: File): Promise<Chosen> {
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

/**
 * Import slides from a PowerPoint file: choose or drop a `.pptx`, see what is in it, choose whether the slides are added to this deck,
 * replace it or come in as a new version of it, and which runs of similar slides to collapse into steps (none, unless asked).
 * The whole import is one step to undo.
 */
export function ImportDialog({ session, onClose }: DialogProps): JSX.Element {
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [mode, setMode] = useState<ImportMode>("add");
  const [imported, setImported] = useState<ImportedPptx | null>(null);
  const [collapse, setCollapse] = useState<ReadonlySet<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);

  // The file is read again when the way it goes in needs different things of it (a new version is matched by markers).
  const markers = mode === "merge";
  useEffect(() => {
    if (!chosen) return;
    try {
      setImported(session.imports.read(chosen.bytes, chosen.name, markers ? "merge" : "add"));
      setError(null);
    } catch (thrown) {
      setImported(null);
      setError(messageOf(thrown));
    }
    setCollapse(new Set());
  }, [chosen, markers, session]);

  const preview = useMemo(() => {
    if (!imported) return null;
    try {
      return session.imports.preview(imported, mode);
    } catch (thrown) {
      setError(messageOf(thrown));
      return null;
    }
  }, [imported, mode, session]);

  const take = (file: File | undefined) => {
    if (!file) return;
    void readFile(file).then(setChosen, (thrown: unknown) => setError(messageOf(thrown)));
  };
  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setOver(false);
    take(event.dataTransfer.files[0]);
  };

  const apply = async () => {
    if (!imported || !preview || busy) return;
    setBusy(true);
    try {
      const done = await session.imports.apply(imported, { mode, collapse: preview.runs.filter((_, i) => collapse.has(i)) });
      if (done) {
        session.host.notify?.(`Imported ${done.slides.length === 1 ? "1 slide" : `${done.slides.length} slides`}.`);
        onClose();
      }
    } catch (thrown) {
      setError(messageOf(thrown));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Import slides from PowerPoint"
      width={520}
      onClose={onClose}
      footer={
        <>
          <TextButton onClick={onClose}>Cancel</TextButton>
          <TextButton primary onClick={() => void apply()} disabled={!imported || !preview || busy}>
            Import
          </TextButton>
        </>
      }
    >
      <div className="ks-dg-form">
        <label
          className={`ks-im-drop${over ? " is-over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
        >
          <input type="file" accept={ACCEPT} aria-label="PowerPoint file" data-autofocus="" onChange={(event) => take(event.target.files?.[0])} />
          <span>{chosen ? "Choose another file, or drop one here" : "Choose a PowerPoint file (.pptx), or drop it here"}</span>
          {!chosen && <span className="ks-sp-hint">Text, shapes, pictures, tables, notes and the theme come over. What a deck cannot hold is kept as it was, and said so.</span>}
        </label>
        {error && (
          <p role="alert" className="ks-im-error">
            {error}
          </p>
        )}
        {chosen && imported && <ImportSummary imported={imported} name={chosen.name} />}
        {imported && (
          <div className="ks-dg-field">
            <span className="ks-dg-label">Where the slides go</span>
            <div className="ks-im-mode" role="radiogroup" aria-label="Where the slides go">
              {MODES.map((option) => (
                <label key={option.value} className="ks-im-choice">
                  <input type="radio" name="import-mode" checked={mode === option.value} onChange={() => setMode(option.value)} />
                  <span>
                    {option.label}
                    <small>{option.note}</small>
                  </span>
                </label>
              ))}
            </div>
            {preview?.plan.notes.map((note) => (
              <p key={note} className="ks-sp-hint">
                {note}
              </p>
            ))}
          </div>
        )}
        {preview && preview.runs.length > 0 && (
          <div className="ks-dg-field">
            <span className="ks-dg-label">Similar slides</span>
            {preview.runs.map((run, i) => (
              <label key={run.ids.join()} className="ks-im-run">
                <input
                  type="checkbox"
                  checked={collapse.has(i)}
                  onChange={(event) => setCollapse((was) => new Set(event.target.checked ? [...was, i] : [...was].filter((n) => n !== i)))}
                />
                <span>
                  {`Collapse ${run.ids.length} similar slides into steps`}
                  <small>{`“${run.titles[0] ?? "Untitled slide"}” and the ${run.ids.length - 1} after it, made by copying a slide and changing a little`}</small>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
