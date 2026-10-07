import { type ChangeEvent, type ReactNode, useRef, useState } from "react";

import { useWorkspace } from "../workspace/store";
import { importDeck, summary } from "./import-deck";
import { useDecks } from "./store";

/**
 * "Import PowerPoint…": chooses a `.pptx` and makes a deck of it, which then opens. `project` is where the deck
 * goes and `title` what to call it (the file's name when empty).
 */
export function ImportButton({ project, title, className, children, onFailed }: { project: string | null; title?: string; className?: string; children: ReactNode; onFailed?(message: string): void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    const client = useWorkspace.getState().client;
    if (!file || !client || busy) return;
    setBusy(true);
    try {
      const done = await importDeck(client, file, project, title);
      await useDecks.getState().load();
      useDecks.setState({ creating: false, draftProject: null });
      useWorkspace.getState().openPath(done.path);
      useWorkspace.getState().toast(summary(done));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      (onFailed ?? ((text: string) => useWorkspace.getState().toast(text)))(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={className}>
        {busy ? "Importing…" : children}
      </button>
      <input ref={input} type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" aria-label="PowerPoint file" hidden onChange={(event) => void choose(event)} />
    </>
  );
}
