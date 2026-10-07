// Typing "/" in the editor: when the menu opens, how it filters, and what
// picking, Escape and plain typing do.

import { afterEach, describe, expect, it } from "vitest";

import { useTestEditor } from "../../../../test/editor";
import { slashAllowed, slashQuery, startSlash } from "./slash";

const editor = useTestEditor();
const menu = () => document.querySelector<HTMLElement>(".kasten-menu");
const selectedKey = () => menu()?.querySelector<HTMLElement>(".kasten-menu-item.is-selected")?.dataset.key;
const query = () => slashQuery(editor.view.state);

afterEach(() => {
  editor.press("Escape");
});

describe("the slash menu", () => {
  it("opens on / at the start of a block or after a space, not inside a word", () => {
    editor.open("and\n\n```\ncode\n```\n");
    const { state } = editor.view;
    expect(slashAllowed(state, 1)).toBe(true);
    expect(slashAllowed(state, 2)).toBe(false);
    editor.caret("code");
    expect(slashAllowed(editor.view.state, editor.view.state.selection.from)).toBe(false);
  });

  it("lists Notion's blocks and filters as you type", () => {
    editor.open("Hello\n").caret("Hello");
    editor.type("/");
    expect(query()).toBe("");
    expect(menu()?.textContent).toContain("Basic blocks");
    expect(selectedKey()).toBe("text");
    editor.type("h2");
    expect(query()).toBe("h2");
    expect(selectedKey()).toBe("h2");
  });

  it("turns the block into the pick and removes what was typed", () => {
    editor.open("Hello\n").caret("Hello");
    editor.type("/h2").press("Enter");
    expect(query()).toBeNull();
    expect(menu()).toBeNull();
    expect(editor.save()).toBe("## Hello\n");
  });

  it("stops the browser's own Enter when it picks", () => {
    editor.open("Hello\n").caret("Hello");
    editor.type("/tog");
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    editor.view.dom.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(editor.types()[0]).toBe("toggle");
  });

  it("moves through the list with the arrow keys", () => {
    editor.open("Item\n").caret("Item");
    editor.type("/list");
    const first = selectedKey();
    editor.press("ArrowDown");
    expect(selectedKey()).not.toBe(first);
    editor.press("ArrowUp");
    expect(selectedKey()).toBe(first);
  });

  it("picks with a click", () => {
    editor.open("Task\n").caret("Task");
    editor.type("/todo");
    menu()?.querySelector<HTMLElement>('[data-key="todo"]')?.click();
    expect(editor.save()).toBe("- [ ] Task\n");
  });

  it("keeps the text on Escape, and closes on a space when nothing matches", () => {
    editor.open("x\n").caret("x", true);
    editor.type(" /zzz");
    expect(menu()?.textContent).toContain("No results");
    editor.type(" ");
    expect(query()).toBeNull();
    // Markdown drops a paragraph's trailing space anyway.
    expect(editor.save()).toBe("x /zzz\n");

    editor.open("y\n").caret("y", true);
    editor.type(" /h1").press("Escape");
    expect(query()).toBeNull();
    expect(editor.save()).toBe("y /h1\n");
  });

  it("colours the block from the colour rows", () => {
    editor.open("Warm\n").caret("Warm");
    editor.type("/red").press("Enter");
    expect(editor.save()).toBe('<span style="color: red">Warm</span>\n');
  });

  it("turns a line into a block equation", () => {
    editor.open("E = mc^2\n").caret("E");
    editor.type("/math");
    expect(selectedKey()).toBe("math");
    editor.press("Enter");
    expect(editor.save()).toBe("$$\nE = mc^2\n$$\n");
  });

  it("puts an inline equation at the caret and opens its field", async () => {
    editor.open("Area is\n").caret("Area is", true);
    editor.type(" /inline eq").press("Enter");
    await Promise.resolve();
    const field = document.querySelector<HTMLInputElement>(".kasten-math-field")!;
    expect(document.activeElement).toBe(field);
    field.value = "\\pi r^2";
    field.dispatchEvent(new Event("input"));
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(document.querySelector(".kasten-math-field")).toBeNull();
    editor.type(" here");
    expect(editor.save()).toBe("Area is $\\pi r^2$ here\n");
  });

  it("drops an inline equation left empty", async () => {
    editor.open("Plain\n").caret("Plain", true);
    editor.type(" /inline eq").press("Enter");
    await Promise.resolve();
    document.querySelector<HTMLInputElement>(".kasten-math-field")!.blur();
    expect(document.querySelector(".kasten-math-field")).toBeNull();
    expect(editor.view.state.doc.textContent).toBe("Plain ");
  });

  it("offers no Template… where the page gives it none", () => {
    editor.open("");
    editor.type("/");
    expect(menu()?.textContent).toContain("Basic blocks");
    expect(menu()?.textContent).not.toContain("Template…");
  });

  it("opens from the handle's plus in an empty block", () => {
    editor.open("A\n\nB\n");
    const { view } = editor;
    const at = view.state.doc.child(0).nodeSize;
    view.dispatch(view.state.tr.insert(at, view.state.schema.nodes.paragraph!.create()));
    startSlash(view, at + 1);
    expect(query()).toBe("");
    editor.type("quote").press("Enter");
    editor.type("Said");
    expect(editor.save()).toBe("A\n\n> Said\n\nB\n");
  });
});
