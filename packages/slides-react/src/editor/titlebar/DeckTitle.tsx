import { type JSX, useRef, useState } from "react";

import { useReturnFocus } from "../menus/focus.ts";
import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { useEditorValue } from "../useEditor.ts";

/**
 * The deck's name as an input that looks like plain text until the pointer is
 * on it or it has the focus. Enter or leaving it renames the deck; Escape
 * puts the old name back. A name of nothing but spaces is not taken.
 */
export function DeckTitle({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  const title = useEditorValue(session, (state) => state.deck.title);
  /** What is being typed; null while the input just shows the deck's name. */
  const [draft, setDraft] = useState<string | null>(null);
  const abandoned = useRef(false);
  const back = useReturnFocus(ui);
  const shown = draft ?? title;

  return (
    // The hidden copy of the text beside the input gives it the width of what it holds.
    <div className="ks-title-field" data-value={shown}>
      <input
        className="ks-title-input"
        aria-label="Deck title"
        value={shown}
        spellCheck={false}
        maxLength={200}
        onFocus={(event) => {
          back.remember(event);
          setDraft(title);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (abandoned.current) abandoned.current = false;
          else if (draft !== null) session.slides.setTitle(draft);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== "Escape") return;
          abandoned.current = event.key === "Escape";
          event.currentTarget.blur();
          back.restore();
        }}
      />
    </div>
  );
}
