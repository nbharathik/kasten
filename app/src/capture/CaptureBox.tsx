// The quick capture box: type, Tab to choose where it goes, Enter to save.
// Esc, or clicking away, hides it and keeps the draft for next time.
// Saving goes through the same core commands as the main window, which then
// hears what was captured.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import { dayFrom } from "../lib/dates";
import type { VaultClient } from "../lib/vault/types";
import { firstLine, INBOX, nextTarget, placeName, targetsWith, type Target } from "./targets";

const DRAFT = "kasten.capture.draft";

export interface CaptureHost {
  client: VaultClient;
  /** Hides the window; the draft stays. */
  hide(): void;
  /** Tells the main window what was captured, and hides. */
  done(captured: { path: string; title: string; place: string }): void;
  /** Calls `then` each time the window opens; returns how to stop. */
  onOpen(then: () => void): () => void;
}

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(text: string): void {
  try {
    if (text) localStorage.setItem(DRAFT, text);
    else localStorage.removeItem(DRAFT);
  } catch {
    // No storage: the draft lasts while the window does.
  }
}

export function CaptureBox({ host }: { host: CaptureHost }) {
  const [text, setText] = useState(loadDraft);
  const [targets, setTargets] = useState<Target[]>(() => targetsWith([]));
  const [target, setTarget] = useState<Target>(INBOX);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(() => {
    box.current?.focus();
    host.client.list().then(
      (notes) =>
        setTargets(
          targetsWith(notes.filter((n) => n.kind === "project" && n.project).map((n) => ({ slug: n.project!, title: n.title }))),
        ),
      () => {},
    );
  }, [host]);
  useEffect(() => {
    refresh();
    return host.onOpen(refresh);
  }, [host, refresh]);

  const save = async () => {
    const markdown = text.trim();
    if (!markdown || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      let path: string;
      let title = firstLine(markdown);
      if (target.kind === "journal") {
        const day = await host.client.journal(dayFrom(0));
        await host.client.append(day.meta.path, markdown);
        path = day.meta.path;
        title = day.meta.title;
      } else {
        const note = await host.client.capture(markdown, [], target.kind === "project" ? target.slug : null);
        path = note.meta.path;
        title = note.meta.title || title;
      }
      setText("");
      saveDraft("");
      host.done({ path, title, place: placeName(target) });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void save();
    } else if (event.key === "Tab") {
      event.preventDefault();
      setTarget((at) => nextTarget(targets, at, event.shiftKey));
    } else if (event.key === "Escape") {
      event.preventDefault();
      host.hide();
    }
  };

  return (
    <div className="kasten-capture">
      <textarea
        ref={box}
        autoFocus
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          saveDraft(e.target.value);
        }}
        onKeyDown={onKeyDown}
        placeholder="Capture a thought…"
        aria-label="Quick capture"
        spellCheck
        className="kasten-capture-text"
      />
      <footer className="kasten-capture-foot">
        <button type="button" className="kasten-capture-target" aria-label={`Save to ${placeName(target)}; Tab changes it`} onClick={() => setTarget((at) => nextTarget(targets, at))}>
          → {placeName(target)}
        </button>
        {problem ? (
          <span role="alert" className="kasten-capture-problem">
            {problem}
          </span>
        ) : (
          <span className="kasten-capture-hint">Tab: where · Enter: save · Shift+Enter: new line · Esc: hide</span>
        )}
      </footer>
    </div>
  );
}
