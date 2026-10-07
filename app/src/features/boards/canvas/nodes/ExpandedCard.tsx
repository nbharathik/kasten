// An expanded card: the whole note, edited in place on the board. Typing
// and selecting text in it do not drag the card; the bar on top drags it.
// It scrolls (and the wheel stays in it) only while selected or being
// typed in: a scroll area is a layer of its own for the browser, and a
// board of them costs every frame. Otherwise the wheel pans the board.

import { useEffect, useRef, useState } from "react";

import { Icon } from "../../../../ui/Icon";
import { LazyNotePage } from "../../../workspace/page/LazyNotePage";
import { useWorkspace } from "../../../workspace/store";
import { useBoard, useBoardState } from "../context";
import { setCardSize } from "../state/gestures";
import { openFile } from "../state/making";

/** Puts the caret end of the note's text. */
function caretAtEnd(editor: HTMLElement): void {
  editor.focus({ preventScroll: true });
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Puts the caret in the card once its editor has loaded: in the title of
 * a new card, at the end of the text of one double-clicked. */
function useFocusCard(id: string, root: React.RefObject<HTMLDivElement | null>) {
  const board = useBoard();
  const at = useBoardState((s) => (s.focusCard?.id === id ? s.focusCard.at : null));
  useEffect(() => {
    if (!at) return;
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      const title = root.current?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Page title"]');
      const text = root.current?.querySelector<HTMLElement>('[contenteditable="true"]');
      if (at === "title" && title) title.focus({ preventScroll: true });
      else if (at === "end" && text) caretAtEnd(text);
      else if (tries++ < 240) return void (frame = requestAnimationFrame(attempt));
      board.store.setState({ focusCard: null });
    };
    frame = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(frame);
  }, [at, board, root]);
}

export function ExpandedCard({ id, path, active }: { id: string; path: string; active: boolean }) {
  const board = useBoard();
  const client = useWorkspace((s) => s.client);
  const root = useRef<HTMLDivElement>(null);
  useFocusCard(id, root);
  const [focused, setFocused] = useState(false);
  const scrolls = active || focused;
  return (
    <div className="kasten-card-expanded">
      <div className="kasten-card-bar" title="Drag to move">
        <span className="kasten-card-grip" aria-hidden="true" />
        <span className="flex-1" />
        <button type="button" className="nodrag" aria-label="Open in the side stack" title="Open in the side stack" onClick={() => openFile(board, path, "stack")}>
          <Icon name="stack" className="size-3.5" />
        </button>
        <button type="button" className="nodrag" aria-label="Show the first lines only" title="Show the first lines only" onClick={() => setCardSize(board, [id], null)}>
          <Icon name="close" className="size-3.5" />
        </button>
      </div>
      <div
        ref={root}
        className={`kasten-card-page nodrag nopan${scrolls ? " is-scrolling nowheel" : ""}`}
        onFocus={() => setFocused(true)}
        onBlur={(event) => !event.currentTarget.contains(event.relatedTarget as Node | null) && setFocused(false)}
        onKeyDown={(event) => {
          // Escape the editor did not use leaves the note for the board,
          // the card still selected.
          if (event.key !== "Escape" || event.defaultPrevented) return;
          event.preventDefault();
          (event.target as HTMLElement).blur?.();
          root.current?.closest<HTMLElement>(".kasten-board")?.focus();
        }}
      >
        {client && <LazyNotePage client={client} path={path} compact />}
      </div>
    </div>
  );
}
