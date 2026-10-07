// What a host can ask of an editor from outside: the buttons of a toolbar.
// Each one changes the selected text and hands focus back to the editor.

import type { Align, ListKind, Text } from "@kasten-slides/wasm";
import type { EditorView } from "prosemirror-view";

import { indent, setAlign, setLineSpacing, toggleList } from "./block-commands.ts";
import type { MountedEditor } from "./editor.ts";
import type { FormatState } from "./format-state.ts";
import { linkFromInput } from "./links.ts";
import { type Command, clearFormatting, setLink, setValueMark, stepFontSize, toggleFlag } from "./mark-commands.ts";
import { hexOf } from "../theme/index.ts";
import { wholeText } from "./selection-info.ts";

export interface TextEditorHandle {
  focus(): void;
  getText(): Text;
  selectAll(): void;
  formatState(): FormatState;
  toggleBold(): void;
  toggleItalic(): void;
  toggleUnderline(): void;
  toggleStrike(): void;
  toggleCode(): void;
  /** A theme colour (`accent2`) or `#rrggbb`; null takes the colour off, so the text style's own applies. */
  setColor(color: string | null): void;
  /** A size in points; null takes it off. */
  setSize(points: number | null): void;
  /** The next size along the usual list (8, 9, 10 ... 96) up for a positive number, down for a negative one. */
  stepSize(delta: number): void;
  /** A theme font role (`heading`, `body`, `code`) or a family name; null takes it off. */
  setFont(font: string | null): void;
  setAlign(align: Align): void;
  toggleList(kind: ListKind): void;
  indent(delta: 1 | -1): void;
  /** A multiple of the line height, such as 1.15; null for the text style's own. */
  setLineSpacing(multiple: number | null): void;
  /** An address for the selected text, or the link the caret is in; null takes the link off. A bare `example.com` becomes a web address; an address that must not be followed is refused. */
  setLink(href: string | null): void;
  clearFormatting(): void;
  /** Types text where the selection is. */
  insertText(text: string): void;
}

/** What nothing selected looks like: no overrides, left aligned. */
const PLAIN_STATE: FormatState = { bold: false, italic: false, underline: false, strike: false, code: false, color: null, size: null, font: null, align: "left", list: null, level: 0, link: null, lineSpacing: null };

/** The views of the handles made here, for tests to reach into. */
const views = new WeakMap<TextEditorHandle, () => EditorView | null>();

/** The view behind a handle. For tests. */
export function viewOfHandle(handle: TextEditorHandle): EditorView | null {
  return views.get(handle)?.() ?? null;
}

/**
 * A handle on whatever editor `current` returns. Before the editor exists and
 * after it is gone the handle does nothing, and reads the text `fallback` gives.
 */
export function createHandle(current: () => MountedEditor | null, fallback: () => Text): TextEditorHandle {
  const run = (command: Command): void => {
    const editor = current();
    if (!editor) return;
    const { view } = editor;
    command(view.state, (tr) => view.dispatch(tr));
    view.focus();
  };

  const handle: TextEditorHandle = {
    focus: () => current()?.view.focus(),
    getText: () => current()?.getText() ?? fallback(),
    selectAll() {
      const view = current()?.view;
      if (!view) return;
      view.dispatch(view.state.tr.setSelection(wholeText(view.state)));
      view.focus();
    },
    formatState: () => current()?.formatState() ?? PLAIN_STATE,
    toggleBold: () => {
      const editor = current();
      if (editor) run(toggleFlag("bold", editor.ctx));
    },
    toggleItalic: () => {
      const editor = current();
      if (editor) run(toggleFlag("italic", editor.ctx));
    },
    toggleUnderline: () => {
      const editor = current();
      if (editor) run(toggleFlag("underline", editor.ctx));
    },
    toggleStrike: () => {
      const editor = current();
      if (editor) run(toggleFlag("strike", editor.ctx));
    },
    toggleCode: () => {
      const editor = current();
      if (editor) run(toggleFlag("code", editor.ctx));
    },
    setColor(color) {
      const editor = current();
      if (!editor) return;
      if (color === null) run(setValueMark("color", null));
      else if (hexOf(editor.ctx.theme, color) !== null) run(setValueMark("color", color));
    },
    setSize(points) {
      if (points === null) run(setValueMark("size", null));
      else if (Number.isFinite(points) && points > 0) run(setValueMark("size", Math.min(999, Math.round(points * 100) / 100)));
    },
    stepSize(delta) {
      const editor = current();
      if (editor && Number.isFinite(delta)) run(stepFontSize(delta, editor.ctx));
    },
    setFont(font) {
      const name = font?.trim();
      run(setValueMark("font", name ? name : null));
    },
    setAlign: (align) => run(setAlign(align)),
    toggleList: (kind) => run(toggleList(kind)),
    indent: (delta) => run(indent(delta)),
    setLineSpacing(multiple) {
      if (multiple === null) run(setLineSpacing(null));
      else if (Number.isFinite(multiple) && multiple > 0) run(setLineSpacing(multiple));
    },
    setLink(href) {
      if (href === null) return run(setLink(null));
      const address = linkFromInput(href);
      if (address !== null) run(setLink(address));
    },
    clearFormatting: () => run(clearFormatting),
    insertText(text) {
      const view = current()?.view;
      if (!view || text === "") return;
      view.dispatch(view.state.tr.insertText(text));
      view.focus();
    },
  };
  views.set(handle, () => current()?.view ?? null);
  return handle;
}
