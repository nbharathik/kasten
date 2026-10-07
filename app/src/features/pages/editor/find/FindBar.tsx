// The find bar over a page: Mod+F finds, Mod+Alt+F also replaces. Enter
// goes to the next match and Shift+Enter back; Escape closes it and puts
// the caret on the match. The page's own text stays as it is until a
// replace, which Mod+Z takes back.

import "./find.css";

import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Crepe } from "@milkdown/crepe";
import { useEffect, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";

import { IconButton } from "../../../../ui/Button";
import { clearFind, findState, onFindChange, replaceAll, replaceCurrent, setQuery, step } from "./find";

export interface FindOpen {
  replace: boolean;
  /** The selected text, to look for at once. */
  seed: string;
  /** Counts each Mod+F, so a second one takes focus back to the bar. */
  opened: number;
}

/** Opens the find bar on Mod+F when the keys are meant for this page: focus
 * is in it, or nowhere and this is the focused pane's first page. */
export function useFindKeys(root: RefObject<HTMLElement | null>, crepe: RefObject<Crepe | null>, open: (update: (was: FindOpen | null) => FindOpen) => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.code !== "KeyF" || event.defaultPrevented) return;
      const el = root.current;
      const editor = crepe.current;
      if (!el || !editor) return;
      const active = document.activeElement;
      const first = document.querySelector(".kasten-pane.is-focused .kasten-page-editor") ?? document.querySelector(".kasten-page-editor");
      const here = active && active !== document.body ? (el.closest(".kasten-page") ?? el).contains(active) : first === el;
      if (!here) return;
      event.preventDefault();
      const { state } = editor.editor.ctx.get(editorViewCtx);
      const picked = state.doc.textBetween(state.selection.from, state.selection.to, "\n");
      open((was) => ({
        replace: event.altKey || (was?.replace ?? false),
        seed: picked && !picked.includes("\n") ? picked : (was?.seed ?? ""),
        opened: (was?.opened ?? 0) + 1,
      }));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [root, crepe, open]);
}

export function FindBar({ view, find, onClose }: { view: EditorView; find: FindOpen; onClose(): void }) {
  const [query, setText] = useState(find.seed);
  const [replacement, setReplacement] = useState("");
  const [replacing, setReplacing] = useState(find.replace);
  const [, changed] = useReducer((n: number) => n + 1, 0);
  const input = useRef<HTMLInputElement>(null);

  // The count follows typing in the page.
  useEffect(() => {
    const stop = onFindChange(view, changed);
    return stop;
  }, [view]);
  // Each Mod+F: the selected text, if any, and the field ready to type in.
  useEffect(() => {
    if (find.seed) {
      setText(find.seed);
      setQuery(view, find.seed);
    }
    if (find.replace) setReplacing(true);
    input.current?.focus();
    input.current?.select();
  }, [view, find]);

  const { matches, index } = findState(view.state);
  const count = !query ? "" : matches.length === 0 ? "No results" : `${index + 1} of ${matches.length}`;
  // The marks go with the bar. (A page closing takes its editor, marks and
  // all, so nothing is dispatched to it then.)
  const close = () => {
    clearFind(view);
    onClose();
    view.focus();
  };
  const keys = (event: ReactKeyboardEvent, enter: () => void) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      enter();
    }
  };

  return (
    <div className="kasten-find-bar" role="search" aria-label="Find in page">
      <div className="kasten-find-row">
        <IconButton icon={replacing ? "chevron-down" : "chevron"} size="sm" label={replacing ? "Hide replace" : "Replace"} onClick={() => setReplacing(!replacing)} />
        <input
          ref={input}
          className="kasten-find-input"
          aria-label="Find in page"
          placeholder="Find in page"
          value={query}
          onChange={(e) => {
            setText(e.target.value);
            setQuery(view, e.target.value);
          }}
          onKeyDown={(e) => keys(e, () => step(view, e.shiftKey ? -1 : 1))}
        />
        <span className="kasten-find-count" aria-live="polite">
          {count}
        </span>
        <IconButton icon="chevron-up" size="sm" label="Previous match" disabled={matches.length === 0} onClick={() => step(view, -1)} />
        <IconButton icon="chevron-down" size="sm" label="Next match" disabled={matches.length === 0} onClick={() => step(view, 1)} />
        <IconButton icon="close" size="sm" label="Close find" onClick={close} />
      </div>
      {replacing && (
        <div className="kasten-find-row is-replace">
          <input
            className="kasten-find-input"
            aria-label="Replace with"
            placeholder="Replace with"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => keys(e, () => replaceCurrent(view, replacement))}
          />
          <button type="button" className="ui-btn is-sm" disabled={matches.length === 0} onClick={() => replaceCurrent(view, replacement)}>
            Replace
          </button>
          <button type="button" className="ui-btn is-sm" disabled={matches.length === 0} onClick={() => replaceAll(view, replacement)}>
            Replace all
          </button>
        </div>
      )}
    </div>
  );
}
