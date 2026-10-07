// The ProseMirror editor of one text box, without React: a document made from
// the text, the plugins that give it keys, history, paste and decorations,
// and a view in the same box as the read-only drawing.

import type { Text, Theme } from "@kasten-slides/wasm";
import { closeHistory, history } from "prosemirror-history";
import { DOMSerializer, type Slice } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { type BoxSettings, boxCss } from "./box-style.ts";
import { docToText, textToDoc } from "./convert.ts";
import { cssText } from "./css.ts";
import { paragraphDecorations } from "./decorations.ts";
import { type FormatState, formatStateOf } from "./format-state.ts";
import { listRule } from "./input-rules.ts";
import { type KeyHooks, keyBindings, keysPlugin } from "./keys.ts";
import { pastePlugin, sanitizeCopiedHtml } from "./paste.ts";
import { type TextSchema, createTextSchema, markDom } from "./schema.ts";
import type { EditorContext } from "./selection-info.ts";

/** What the editor tells whoever hosts it. */
export interface EditorHooks extends KeyHooks {
  /** The text after a change to the words. */
  change(text: Text): void;
  /** The formatting of the selection, when it changes. */
  format(state: FormatState): void;
  /** The editor lost focus. */
  blur(event: FocusEvent): void;
}

export interface EditorOptions extends BoxSettings {
  theme: Theme;
  baseStyle: string;
  text: Text;
  hooks: EditorHooks;
}

export interface MountedEditor {
  readonly view: EditorView;
  readonly ctx: EditorContext;
  /** The text as it is now. */
  getText(): Text;
  /** Starts again from another text; the editor's own history is dropped. */
  setText(text: Text): void;
  /** Moves and resizes the box. */
  setBox(box: BoxSettings): void;
  formatState(): FormatState;
  destroy(): void;
}

/** A serializer for the clipboard: the same elements, except that a link carries its address as `href` for other programs to follow. */
function clipboardSerializer(theme: Theme, schema: TextSchema): DOMSerializer {
  const base = DOMSerializer.fromSchema(schema);
  return new DOMSerializer(base.nodes, {
    ...base.marks,
    link: (mark) => {
      const href = typeof mark.attrs.href === "string" ? mark.attrs.href : "";
      const [tag, attrs] = markDom(theme, { name: "link", value: href });
      return [tag, { ...attrs, href }, 0];
    },
  });
}

export function mountEditor(host: HTMLElement, options: EditorOptions): MountedEditor {
  const { theme, baseStyle, hooks } = options;
  const ctx: EditorContext = { theme, baseStyle };
  const schema = createTextSchema(theme, baseStyle);
  let base = options.text;
  let box: BoxSettings = { width: options.width, height: options.height, insets: options.insets, valign: options.valign };
  let last = "";

  const plugins = [keysPlugin(keyBindings(ctx, hooks)), history(), pastePlugin(), paragraphDecorations(ctx)];
  const stateFor = (text: Text): EditorState => EditorState.create({ schema, doc: textToDoc(text, schema), plugins });
  const attributes = (): Record<string, string> => ({ class: "ks-text ks-text-editing", style: cssText(boxCss(box, base)), role: "textbox", "aria-multiline": "true" });

  const report = (): void => {
    const state = formatStateOf(view.state, ctx);
    const key = JSON.stringify(state);
    if (key === last) return;
    last = key;
    hooks.format(state);
  };

  const view: EditorView = new EditorView(host, {
    state: stateFor(base),
    attributes: attributes(),
    dispatchTransaction(tr) {
      const next = view.state.apply(tr);
      view.updateState(next);
      if (tr.docChanged) {
        base = docToText(next.doc, base);
        hooks.change(base);
      }
      if (tr.docChanged || tr.selectionSet || tr.storedMarksSet) report();
    },
    handleTextInput(v, from, to, text) {
      const tr = listRule(v.state, from, to, text);
      if (!tr) return false;
      v.dispatch(tr);
      // What is typed next is a step of its own, so one undo takes back the conversion and no more.
      v.dispatch(closeHistory(v.state.tr));
      return true;
    },
    handleDOMEvents: {
      blur(_view, event) {
        hooks.blur(event);
        return false;
      },
    },
    // The slide does not scroll to the caret: the box is where it is.
    handleScrollToSelection: () => true,
    clipboardSerializer: clipboardSerializer(theme, schema),
    transformPastedHTML: (html: string) => sanitizeCopiedHtml(html, theme),
    clipboardTextSerializer: (slice: Slice) => slice.content.textBetween(0, slice.content.size, "\n"),
  });

  report();

  return {
    view,
    ctx,
    getText: () => base,
    setText(text) {
      base = text;
      view.updateState(stateFor(text));
      view.setProps({ attributes: attributes() });
      report();
    },
    setBox(next) {
      box = next;
      view.setProps({ attributes: attributes() });
    },
    formatState: () => formatStateOf(view.state, ctx),
    destroy: () => view.destroy(),
  };
}
