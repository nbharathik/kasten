// Mounts the editor for the tests of this folder that need a page.

import type { Paragraph, Text, Theme } from "@kasten-slides/wasm";
import { fireEvent, render } from "@testing-library/react";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { type ReactElement, createRef } from "react";

import { TextEditor, type TextEditorHandle, type TextEditorProps, type FormatState } from "./TextEditor.tsx";
import { viewOfHandle } from "./handle.ts";

export interface Mounted {
  handle: TextEditorHandle;
  view: EditorView;
  changes: Text[];
  formats: FormatState[];
  dones: { text: Text; reason: "escape" | "blur" }[];
  links: (string | null)[];
  rerender: (props: Partial<TextEditorProps>) => void;
  container: HTMLElement;
  unmount: () => void;
}

export function mount(theme: Theme, text: Text, props: Partial<TextEditorProps> = {}, around?: (editor: ReactElement) => ReactElement): Mounted {
  const ref = createRef<TextEditorHandle>();
  const changes: Text[] = [];
  const formats: FormatState[] = [];
  const dones: Mounted["dones"] = [];
  const links: (string | null)[] = [];
  const base: TextEditorProps = {
    theme,
    text,
    baseStyle: "body",
    width: 600,
    height: 200,
    handleRef: ref,
    onChange: (t) => changes.push(t),
    onFormat: (s) => formats.push(s),
    onDone: (t, reason) => dones.push({ text: t, reason }),
    onLinkRequest: (current) => links.push(current),
    ...props,
  };
  const wrap = around ?? ((editor) => editor);
  const result = render(wrap(<TextEditor {...base} />));
  const handle = ref.current;
  const view = handle ? viewOfHandle(handle) : null;
  if (!handle || !view) throw new Error("The editor did not mount.");
  return {
    handle,
    view,
    changes,
    formats,
    dones,
    links,
    container: result.container,
    rerender: (over) => result.rerender(wrap(<TextEditor {...base} {...over} />)),
    unmount: result.unmount,
  };
}

/** Puts the selection at document positions. */
export function selectRange(view: EditorView, anchor: number, head = anchor): void {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, head)));
}

/** A key press on the editor. */
export function press(view: EditorView, key: string, init: KeyboardEventInit & { keyCode?: number } = {}): boolean {
  return fireEvent.keyDown(view.dom, { key, ...init });
}

export const mod = { ctrlKey: true } as const;

export const p = (...runs: Paragraph["runs"]): Paragraph => ({ runs });
export const text = (...paragraphs: Paragraph[]): Text => ({ paragraphs });
export const hello: Text = text(p({ t: "Hello world" }));

/** The style of an element as a map. */
export function styleOf(element: Element): Record<string, string> {
  const found: Record<string, string> = {};
  const declared = (element as HTMLElement).style;
  for (let i = 0; i < declared.length; i++) {
    const name = declared.item(i);
    found[name] = declared.getPropertyValue(name);
  }
  return found;
}

/** The words of each paragraph of the editor's text. */
export const words = (editor: Mounted): string[] => editor.handle.getText().paragraphs.map((paragraph) => paragraph.runs.map((run) => run.t).join(""));
