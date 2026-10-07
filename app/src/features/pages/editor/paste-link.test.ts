// A web address pasted over selected text links the text; with no
// selection, or with more than an address, pasting is as before.

import { TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { findText, useTestEditor } from "../../../test/editor";
import { linkSelection } from "./paste-link";

const editor = useTestEditor();

function select(text: string) {
  const from = findText(editor.doc, text);
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + text.length)));
}

describe("pasting an address over text", () => {
  it("links the selected text", () => {
    editor.open("Read the guide first.\n");
    select("the guide");
    expect(linkSelection(editor.view, " https://example.com/guide?a=1 ")).toBe(true);
    expect(editor.save()).toBe("Read [the guide](https://example.com/guide?a=1) first.\n");
  });

  it("leaves other pastes alone", () => {
    editor.open("Read the guide first.\n");
    select("the guide");
    expect(linkSelection(editor.view, "see https://example.com")).toBe(false);
    expect(linkSelection(editor.view, "javascript:alert(1)")).toBe(false);
    editor.caret("guide");
    expect(linkSelection(editor.view, "https://example.com")).toBe(false);
    expect(editor.save()).toBe("Read the guide first.\n");
  });

  it("does not link across blocks", () => {
    editor.open("One.\n\nTwo.\n");
    const { view } = editor;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, findText(editor.doc, "One"), findText(editor.doc, "Two") + 3)));
    expect(linkSelection(editor.view, "https://example.com")).toBe(false);
  });
});
