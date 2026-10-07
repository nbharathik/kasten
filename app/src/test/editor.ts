// A live page editor for tests: open a note, put the caret somewhere, run
// commands or keys, and read back what would be saved.

import type { Crepe } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection, type Command } from "@milkdown/kit/prose/state";
import { afterAll, beforeAll } from "vitest";

import { createKastenCrepe, type KastenCrepeOptions } from "../features/pages/editor/crepe";
import { openNote, type OpenNote } from "../features/pages/editor/session";

/** Position of the first occurrence of `text` in the document's text, or -1. */
export function findText(doc: Node, text: string): number {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    const index = node.isText ? (node.text ?? "").indexOf(text) : -1;
    if (index >= 0) found = pos + index;
    return found < 0;
  });
  return found;
}

/** Creates one editor for the calling test file. */
export function useTestEditor(options: KastenCrepeOptions = {}) {
  let crepe: Crepe;
  let root: HTMLElement;
  let note: OpenNote | null = null;

  beforeAll(async () => {
    root = document.createElement("div");
    document.body.append(root);
    crepe = await createKastenCrepe(root, options);
  });

  afterAll(async () => {
    await crepe.destroy();
    root.remove();
  });

  const editor = {
    get ctx() {
      return crepe.editor.ctx;
    },
    get view() {
      return crepe.editor.ctx.get(editorViewCtx);
    },
    get doc() {
      return editor.view.state.doc;
    },
    open(body: string) {
      note = openNote(crepe, body);
      return editor;
    },
    /** What would be written for the open note. */
    save(): string {
      if (!note) throw new Error("no note open");
      return note.save();
    },
    /** Puts the caret before `text`, or after it with `after`. */
    caret(text: string, after = false) {
      const pos = findText(editor.doc, text);
      if (pos < 0) throw new Error(`"${text}" is not in the document`);
      const { view } = editor;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, after ? pos + text.length : pos)));
      return editor;
    },
    run(command: Command): boolean {
      const { view } = editor;
      return command(view.state, view.dispatch, view);
    },
    /** Types text at the caret the way the keyboard does, through input rules and the slash menu. */
    type(text: string) {
      const { view } = editor;
      for (const char of text) {
        const { from, to } = view.state.selection;
        const handled = view.someProp("handleTextInput", (f) => f(view, from, to, char, () => view.state.tr.insertText(char, from, to)));
        if (!handled) view.dispatch(view.state.tr.insertText(char, from, to));
      }
      return editor;
    },
    /** Presses a key in the editor. */
    press(key: string, init: KeyboardEventInit = {}) {
      editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
      return editor;
    },
    /** Names of the top-level blocks. */
    types(): string[] {
      const names: string[] = [];
      editor.doc.forEach((node) => void names.push(node.type.name));
      return names;
    },
  };
  return editor;
}
