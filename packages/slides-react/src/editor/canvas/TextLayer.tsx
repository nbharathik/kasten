import type { Element, Text } from "@kasten-slides/wasm";
import { type JSX, useCallback, useEffect, useMemo, useRef } from "react";

import { Upright } from "../../render/elements/Upright.tsx";
import { frameStyle } from "../../render/frame.ts";
import { textRect } from "../../render/index.ts";
import { DEFAULT_INSETS } from "../../text/metrics.ts";
import { TextEditor, type TextEditorHandle } from "../../text/index.ts";
import { boxOf, placeholderOf } from "../../theme/index.ts";
import { settleFresh } from "../quick-add/fresh.ts";
import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { useEditor } from "../useEditor.ts";

/** A box with nothing typed in it yet: a shape that had no words, or a connector without a label. */
const NO_WORDS: Text = { paragraphs: [{ runs: [{ t: "" }] }] };

const wordsOf = (element: Element): Text | null | undefined => {
  if (element.type === "text") return element.text;
  if (element.type === "shape") return element.text;
  return undefined;
};

/**
 * The open text box, edited in place over the slide: in the same box, with the
 * same padding, alignment and turn as the drawing under it, so nothing moves
 * when editing starts. What is typed goes into the deck when editing ends, as
 * one step of undo; the words in between belong to the text editor, which has
 * its own undo.
 */
export function TextLayer({ session, ui, id }: { session: EditorSession; ui: EditorUi; id: string }): JSX.Element | null {
  const state = useEditor(session);
  const handle = useRef<TextEditorHandle>(null);
  // The words typed and not yet in the deck, and the slide they belong to: editing can end because the person went to another slide.
  const pending = useRef<Text | null>(null);
  const home = useRef(session.slide.id);

  const write = useCallback(() => {
    const text = pending.current;
    pending.current = null;
    if (text) session.elements.setText(id, text, home.current);
  }, [session, id]);

  // Whatever ends the edit, by any route, writes what was typed; a box made just now and left empty then goes again.
  useEffect(
    () => () => {
      write();
      settleFresh(session, id);
    },
    [write, session, id],
  );

  // The commands (bold, size, colour, link) reach the box through the window's state.
  useEffect(() => {
    const current = handle.current;
    if (current) ui.setText(current);
    return () => ui.setText(null);
  }, [ui, id]);

  const element = session.slide.elements.find((e) => e.id === id);
  const theme = state.deck.theme;
  const layout = session.slide.layout;
  const box = useMemo(() => (element ? boxOf(theme, layout, element) : null), [element, theme, layout]);
  if (!element || !box || (element.type !== "text" && element.type !== "shape")) return null;

  const slot = placeholderOf(theme, layout, element);
  const words = wordsOf(element) ?? NO_WORDS;
  const area = element.type === "shape" ? textRect(element.shape, box.w, box.h, element.style?.radius) : { x: 0, y: 0, w: box.w, h: box.h };
  const valign = words.valign ?? slot?.valign ?? (element.type === "shape" ? "middle" : "top");

  return (
    <div className="ks-text-layer" style={frameStyle(box, element, 1)} data-editing={id}>
      <div style={{ position: "absolute", left: area.x, top: area.y, width: area.w, height: area.h }}>
        <Upright flipH={element.flipH} flipV={element.flipV}>
          <TextEditor
            handleRef={handle}
            theme={theme}
            text={words}
            baseStyle={slot?.style ?? "body"}
            width={area.w}
            height={area.h}
            insets={words.insets ?? DEFAULT_INSETS}
            valign={valign}
            autoFocus="end"
            onChange={(text) => {
              pending.current = text;
            }}
            onDone={(text) => {
              pending.current = text;
              write();
              session.stopEditing();
            }}
            onLinkRequest={() => ui.openDialog("link")}
          />
        </Upright>
      </div>
    </div>
  );
}
