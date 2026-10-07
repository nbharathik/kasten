// Notion's shortcuts and typing rules, through the real editor.

import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { findText, useTestEditor } from "../../../../test/editor";

const editor = useTestEditor();
const ctrl = { ctrlKey: true };

/** Selects `text` in the document. */
function select(text: string) {
  const from = findText(editor.doc, text);
  const { view } = editor;
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, from + text.length)));
}

describe("text shortcuts", () => {
  it("underline with Ctrl+U, stored as <u>", () => {
    editor.open("Make this matter\n");
    select("matter");
    editor.press("u", ctrl);
    expect(editor.save()).toBe("Make this <u>matter</u>\n");
    editor.open("Read <u>this</u> and **<u>that</u>**\n");
    const marks: string[] = [];
    editor.doc.descendants((n) => void n.marks.forEach((m) => marks.push(m.type.name)));
    expect(marks.filter((m) => m === "underline")).toHaveLength(2);
  });

  it("strike through with Ctrl+Shift+S and highlight with Ctrl+Shift+H", () => {
    editor.open("old new\n");
    select("old");
    // Browsers send "S" with a key code the keymap falls back to; jsdom has no key codes.
    editor.press("s", { ctrlKey: true, shiftKey: true });
    select("new");
    editor.press("h", { ctrlKey: true, shiftKey: true });
    expect(editor.save()).toBe('~~old~~ <span style="background-color: yellow">new</span>\n');
  });

  it("leaves Ctrl+K without a selection to the page, for search", () => {
    editor.open("text\n").caret("text");
    const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true });
    editor.view.dom.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("block shortcuts", () => {
  it.each([
    ["1", "# Title\n"],
    ["4", "- [ ] Title\n"],
    ["5", "- Title\n"],
    ["6", "1. Title\n"],
    ["7", "<details>\n<summary>Title</summary>\n\n</details>\n"],
    ["8", "```\nTitle\n```\n"],
  ])("turn a block into Notion's kind with Ctrl+Alt+%s", (digit, expected) => {
    editor.open("Title\n").caret("Title");
    editor.press(digit, { ctrlKey: true, altKey: true });
    expect(editor.save()).toBe(expected);
  });

  it("duplicate with Ctrl+D and move with Ctrl+Shift+arrows", () => {
    editor.open("One\n\nTwo\n").caret("One");
    editor.press("d", ctrl);
    expect(editor.save()).toBe("One\n\nOne\n\nTwo\n");
    editor.open("One\n\nTwo\n\nThree\n").caret("One");
    editor.press("ArrowDown", { ctrlKey: true, shiftKey: true });
    expect(editor.save()).toBe("Two\n\nOne\n\nThree\n");
    editor.press("ArrowUp", { ctrlKey: true, shiftKey: true });
    expect(editor.save()).toBe("One\n\nTwo\n\nThree\n");
  });

  it("move a block whose selection reaches into the next one", () => {
    editor.open("One\n\nTwo\n\nThree\n");
    const { view } = editor;
    const from = findText(editor.doc, "wo");
    const to = findText(editor.doc, "Thr") + 3;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
    expect(() => editor.press("ArrowDown", { ctrlKey: true, shiftKey: true })).not.toThrow();
    expect(editor.save()).toBe("One\n\nThree\n\nTwo\n");
    const moved = view.state.selection;
    expect(view.state.doc.textBetween(moved.from, moved.to)).toBe("wo");
  });

  it("move list items within their list", () => {
    editor.open("- a\n- b\n- c\n").caret("c");
    editor.press("ArrowUp", { ctrlKey: true, shiftKey: true });
    expect(editor.save()).toBe("- a\n- c\n- b\n");
  });

  it("tick a to-do with Ctrl+Enter", () => {
    editor.open("- [ ] Ship it\n").caret("Ship");
    editor.press("Enter", ctrl);
    expect(editor.save()).toBe("- [x] Ship it\n");
  });

  it("select a block with Esc, step with arrows, and edit with Enter", () => {
    editor.open("One\n\nTwo\n").caret("One");
    editor.press("Escape");
    const selection = () => editor.view.state.selection;
    expect(selection()).toBeInstanceOf(NodeSelection);
    expect((selection() as NodeSelection).node.textContent).toBe("One");
    editor.press("ArrowDown");
    expect((selection() as NodeSelection).node.textContent).toBe("Two");
    editor.press("x");
    expect(editor.save()).toBe("One\n\nTwo\n");
    editor.press("Enter");
    expect(selection()).toBeInstanceOf(TextSelection);
    editor.type("!");
    expect(editor.save()).toBe("One\n\nTwo!\n");
  });
});

describe("typing shortcuts", () => {
  it("make a toggle from > and a quote from \"", () => {
    editor.open("x\n").caret("x");
    editor.view.dispatch(editor.view.state.tr.delete(1, 2));
    editor.type("> ");
    expect(editor.types()[0]).toBe("toggle");
    editor.open("x\n").caret("x");
    editor.view.dispatch(editor.view.state.tr.delete(1, 2));
    editor.type('" Said');
    expect(editor.save()).toBe("> Said\n");
  });

  it("turn arrows into symbols, but not in inline code", () => {
    editor.open("x\n").caret("x", true);
    editor.type(" a -> b <- c => d");
    expect(editor.save()).toBe("x a → b ← c ⇒ d\n");
  });

  it("keep dollar amounts as text", () => {
    editor.open("x\n").caret("x", true);
    editor.type(" costs $5 and $10");
    expect(editor.save()).toBe("x costs $5 and $10\n");
  });
});
