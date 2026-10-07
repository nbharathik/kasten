// Turn into, insert, colour, duplicate and delete: what each writes to the note.

import { NodeSelection } from "@milkdown/kit/prose/state";
import { describe, expect, it } from "vitest";

import { findText, useTestEditor } from "../../../../test/editor";
import { colorBlocks, deleteBlock, duplicateBlock, insertBlock } from "./block-ops";
import { turnBlockInto } from "./block-menu";
import type { BlockKind } from "./catalog";
import { todoInputRule } from "./shortcuts";
import { blockKindAt, turnInto } from "./transform";

const editor = useTestEditor();

/** Opens `body`, puts the caret before `at` and turns that block into `kind`. */
function turned(body: string, at: string, kind: BlockKind): string {
  editor.open(body).caret(at);
  expect(editor.run(turnInto(kind))).toBe(true);
  return editor.save();
}

/** Position of the top-level block that holds `text`. */
function blockPos(text: string, depth = 1): number {
  return editor.doc.resolve(findText(editor.doc, text)).before(depth);
}

describe("turn into", () => {
  it.each([
    ["h1", "# Hello\n"],
    ["h3", "### Hello\n"],
    ["bullet", "- Hello\n"],
    ["numbered", "1. Hello\n"],
    ["todo", "- [ ] Hello\n"],
    ["quote", "> Hello\n"],
    ["callout", "> [!tip]\n> Hello\n"],
    ["code", "```\nHello\n```\n"],
  ] as const)("turns text into %s", (kind, expected) => {
    expect(turned("Hello\n", "Hello", kind)).toBe(expected);
  });

  it("turns text into a toggle titled with the text, caret in its body", () => {
    expect(turned("Hello\n", "Hello", "toggle")).toBe("<details>\n<summary>Hello</summary>\n\n</details>\n");
    expect(editor.view.state.selection.$from.node(-1).type.name).toBe("toggle");
  });

  it("keeps links and maths in a toggle's title as they are written", () => {
    expect(turned("See [[Plan|the plan]] and $x^2$ now\n", "See", "toggle")).toBe("<details>\n<summary>See [[Plan|the plan]] and $x^2$ now</summary>\n\n</details>\n");
  });

  it("changes a list item in place, and the whole list for numbering", () => {
    expect(turned("- a\n- b\n", "b", "todo")).toBe("- a\n- [ ] b\n");
    expect(turned("- a\n- b\n", "b", "numbered")).toBe("1. a\n2. b\n");
    expect(turned("1. a\n2. b\n", "a", "bullet")).toBe("- a\n- b\n");
    expect(turned("- [x] done\n", "done", "bullet")).toBe("- done\n");
  });

  it("lifts a list item out of its list for other kinds", () => {
    expect(turned("- a\n- b\n", "b", "text")).toBe("- a\n\nb\n");
    expect(turned("- a\n  - nested\n", "nested", "h2")).toBe("- a\n\n## nested\n");
  });

  it("unwraps a quote", () => {
    expect(turned("> Hello\n", "Hello", "text")).toBe("Hello\n");
    expect(turned("> Hello\n", "Hello", "h1")).toBe("# Hello\n");
  });

  it("keeps blocks inside a callout inside it", () => {
    expect(turned("> [!note]\n> Hello\n", "Hello", "h2")).toBe("> [!note]\n> ## Hello\n");
  });

  it("knows the kind at the caret", () => {
    editor.open("- [ ] task\n\n> quote\n\n## two\n\ntext\n");
    const kind = (at: string) => (editor.caret(at), blockKindAt(editor.view.state));
    expect([kind("task"), kind("quote"), kind("two"), kind("text")]).toEqual(["todo", "quote", "h2", "text"]);
  });
});

describe("the block menu's turn into", () => {
  it("unwraps callouts and toggles, keeping their titles", () => {
    editor.open("> [!tip] Idea\n> Body\n");
    turnBlockInto(editor.view, 0, "text");
    expect(editor.save()).toBe("Idea\n\nBody\n");

    editor.open("<details>\n<summary>Title</summary>\n\nInside\n\n</details>\n");
    turnBlockInto(editor.view, 0, "h1");
    expect(editor.save()).toBe("# Title\n\nInside\n");
  });

  it("turns a list item from its handle", () => {
    editor.open("- a\n- b\n");
    turnBlockInto(editor.view, blockPos("b", 2), "todo");
    expect(editor.save()).toBe("- a\n- [ ] b\n");
  });
});

describe("inserting blocks", () => {
  it("puts a divider in place of an empty block and keeps writing below it", () => {
    editor.open("Above\n\nBelow\n").caret("Above", true);
    editor.view.dispatch(editor.view.state.tr.split(editor.view.state.selection.from));
    editor.run(insertBlock("divider", editor.ctx));
    expect(editor.types()).toEqual(["paragraph", "hr", "paragraph", "paragraph"]);
    expect(editor.view.state.selection.$from.parent.content.size).toBe(0);
    editor.type("Next");
    expect(editor.save()).toBe("Above\n\n---\n\nNext\n\nBelow\n");
  });

  it("adds a table", () => {
    editor.open("x\n").caret("x", true);
    editor.run(insertBlock("table", editor.ctx));
    expect(editor.types().slice(0, 2)).toEqual(["paragraph", "table"]);
  });
});

describe("block colours", () => {
  it("colour the whole block and what is typed next", () => {
    editor.open("Make it red\n").caret("red", true);
    editor.run(colorBlocks("text_color", "red"));
    editor.type("!");
    expect(editor.save()).toBe('<span style="color: red">Make it red!</span>\n');
    editor.run(colorBlocks("text_color", null));
    expect(editor.save()).toBe("Make it red!\n");
  });

  it("colour a selected block from the block menu", () => {
    editor.open("- one\n- two\n");
    const { view } = editor;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)));
    editor.run(colorBlocks("bg_color", "yellow"));
    expect(editor.save()).toBe('- <span style="background-color: yellow">one</span>\n- <span style="background-color: yellow">two</span>\n');
  });
});

describe("duplicate and delete", () => {
  it("duplicate a block right after itself", () => {
    editor.open("A\n\nB\n");
    editor.run(duplicateBlock(0));
    expect(editor.save()).toBe("A\n\nA\n\nB\n");
  });

  it("delete a block, and a list left without items", () => {
    editor.open("A\n\nB\n");
    editor.run(deleteBlock(0));
    expect(editor.save()).toBe("B\n");

    editor.open("Intro\n\n- only\n");
    editor.run(deleteBlock(blockPos("only", 2)));
    expect(editor.save()).toBe("Intro\n");
  });

  it("leave an empty paragraph when the last block goes", () => {
    editor.open("- only\n");
    editor.run(deleteBlock(blockPos("only", 2)));
    expect(editor.types()).toEqual(["paragraph"]);
  });
});

describe("markdown shortcuts", () => {
  it("turn [] and a space into a to-do", () => {
    editor.open("x\n").caret("x");
    editor.view.dispatch(editor.view.state.tr.insertText("", 1, 2));
    editor.type("[] Buy milk");
    expect(editor.save()).toBe("- [ ] Buy milk\n");
    expect(todoInputRule).toBeTruthy();
  });
});
