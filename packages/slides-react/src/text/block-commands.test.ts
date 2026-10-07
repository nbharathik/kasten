// @vitest-environment node

import type { Paragraph, Text, Theme } from "@kasten-slides/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { backspaceListStart, enter, indent, setAlign, setLineSpacing, softBreak, toggleList } from "./block-commands.ts";
import { formatStateOf } from "./format-state.ts";
import { listRule } from "./input-rules.ts";
import { setValueMark, toggleFlag } from "./mark-commands.ts";
import { type Rig, position, rig, run, textOf, type as typeIn } from "./test-state.ts";
import { themeNamed } from "./test-support.ts";

let light: Rig;
let title: Rig;

beforeAll(async () => {
  const theme: Theme = await themeNamed("Light");
  light = rig(theme, "body");
  title = rig(theme, "title");
});

const text = (...paragraphs: Paragraph[]): Text => ({ paragraphs });
const p = (...runs: Paragraph["runs"]): Paragraph => ({ runs });

describe("what the selection is like", () => {
  const plain = { bold: false, italic: false, underline: false, strike: false, code: false, color: null, size: null, font: null, align: "left", list: null, level: 0, link: null, lineSpacing: null };

  it("has no overrides in plain text", () => {
    expect(formatStateOf(light.state(text(p({ t: "Hello" })), [0, 2]), light.ctx)).toEqual(plain);
  });

  it("reports what the caret is in", () => {
    const base = text({ runs: [{ t: "abc", b: true, i: true, u: true, s: true, code: true, color: "accent2", size: 30, font: "Georgia", link: "https://x.y" }], align: "center", list: "number", level: 2, lineSpacing: 1.5 });
    expect(formatStateOf(light.state(base, [0, 1]), light.ctx)).toEqual({ bold: true, italic: true, underline: true, strike: true, code: true, color: "accent2", size: 30, font: "Georgia", align: "center", list: "number", level: 2, link: "https://x.y", lineSpacing: 1.5 });
  });

  it("reports the marks set aside at a caret", () => {
    const state = run(run(light.state(text(p({ t: "Hello" })), [0, 5]), toggleFlag("bold", light.ctx)), setValueMark("size", 40));
    expect(formatStateOf(state, light.ctx)).toMatchObject({ bold: true, size: 40, italic: false });
  });

  it("says mixed when a selection holds both", () => {
    const base = text(p({ t: "ab", b: true, color: "accent1", size: 12 }, { t: "cd", color: "accent2", size: 12, font: "Georgia" }), { runs: [{ t: "ef" }], align: "right", list: "bullet", lineSpacing: 2 });
    const all = formatStateOf(light.state(base, [0, 0], [1, 2]), light.ctx);
    expect(all).toMatchObject({ bold: "mixed", color: "mixed", size: "mixed", font: "mixed", align: "mixed", list: "mixed", lineSpacing: "mixed", italic: false, link: null });
    const first = formatStateOf(light.state(base, [0, 0], [0, 4]), light.ctx);
    expect(first).toMatchObject({ bold: "mixed", color: "mixed", size: 12, font: "mixed", align: "left", list: null, lineSpacing: null });
    const one = formatStateOf(light.state(base, [0, 0], [0, 2]), light.ctx);
    expect(one).toMatchObject({ bold: true, color: "accent1", size: 12, font: null });
  });

  it("takes the level of the first paragraph selected", () => {
    const base = text({ runs: [{ t: "a" }], list: "bullet", level: 2 }, { runs: [{ t: "b" }], list: "bullet", level: 0 });
    expect(formatStateOf(light.state(base, [0, 0], [1, 1]), light.ctx)).toMatchObject({ level: 2, list: "bullet" });
  });

  it("takes bold and alignment from the text style", () => {
    expect(formatStateOf(title.state(text(p({ t: "T" })), [0, 0], [0, 1]), title.ctx)).toMatchObject({ bold: true, align: "left" });
    const quote = rig(light.ctx.theme, "quote");
    expect(formatStateOf(quote.state(text(p({ t: "T" })), [0, 0], [0, 1]), quote.ctx)).toMatchObject({ italic: true });
    const themed: Theme = { ...light.ctx.theme, textStyles: { ...light.ctx.theme.textStyles, body: { ...light.ctx.theme.textStyles.body!, align: "center" } } };
    expect(formatStateOf(rig(themed).state(text(p({ t: "T" })), [0, 0], [0, 1]), { theme: themed, baseStyle: "body" }).align).toBe("center");
  });

  it("looks at a caret in an empty paragraph", () => {
    const state = light.state(text({ runs: [{ t: "" }], align: "right", list: "bullet" }), [0, 0]);
    expect(formatStateOf(state, light.ctx)).toMatchObject({ align: "right", list: "bullet", bold: false });
  });
});

describe("paragraphs", () => {
  const three = text(p({ t: "one" }), p({ t: "two" }), p({ t: "three" }));

  it("aligns every paragraph the selection touches", () => {
    const state = run(light.state(three, [0, 1], [1, 1]), setAlign("center"));
    expect(textOf(state, three).paragraphs.map((q) => q.align)).toEqual(["center", "center", undefined]);
    expect(textOf(run(light.state(three, [2, 0]), setAlign("justify")), three).paragraphs.map((q) => q.align)).toEqual([undefined, undefined, "justify"]);
  });

  it("sets line spacing, or takes it off with null", () => {
    const state = run(light.state(three, [0, 0], [2, 1]), setLineSpacing(1.5));
    expect(textOf(state, three).paragraphs.map((q) => q.lineSpacing)).toEqual([1.5, 1.5, 1.5]);
    expect(textOf(run(state, setLineSpacing(null)), three)).toEqual(three);
  });

  it("makes a list of the selected paragraphs, and plain paragraphs again", () => {
    const bullets = run(light.state(three, [0, 0], [1, 1]), toggleList("bullet"));
    expect(textOf(bullets, three).paragraphs.map((q) => q.list)).toEqual(["bullet", "bullet", undefined]);
    const plain = run(bullets, toggleList("bullet"));
    expect(textOf(plain, three)).toEqual(three);
  });

  it("changes a list to another kind, and makes one of a selection that is partly a list", () => {
    const mixed = text({ runs: [{ t: "a" }], list: "bullet" }, p({ t: "b" }));
    expect(textOf(run(light.state(mixed, [0, 0], [1, 1]), toggleList("bullet")), mixed).paragraphs.map((q) => q.list)).toEqual(["bullet", "bullet"]);
    expect(textOf(run(light.state(mixed, [0, 0], [1, 1]), toggleList("number")), mixed).paragraphs.map((q) => q.list)).toEqual(["number", "number"]);
  });

  it("takes the level off with the list", () => {
    const nested = text({ runs: [{ t: "a" }], list: "bullet", level: 2 });
    expect(textOf(run(light.state(nested, [0, 0]), toggleList("bullet")), nested)).toEqual(text(p({ t: "a" })));
  });

  it("indents and outdents within the nine levels", () => {
    const list = text({ runs: [{ t: "a" }], list: "bullet" });
    let state = light.state(list, [0, 0]);
    for (let i = 0; i < 12; i++) state = run(state, indent(1));
    expect(textOf(state, list).paragraphs[0]?.level).toBe(8);
    for (let i = 0; i < 3; i++) state = run(state, indent(-1));
    expect(textOf(state, list).paragraphs[0]?.level).toBe(5);
    for (let i = 0; i < 9; i++) state = run(state, indent(-1));
    expect(textOf(state, list).paragraphs[0]).toEqual({ runs: [{ t: "a" }], list: "bullet" });
  });

  it("takes the key even where it can move nothing, and changes no document", () => {
    const list = text({ runs: [{ t: "a" }], list: "bullet" });
    const state = light.state(list, [0, 0]);
    let dispatched = 0;
    expect(indent(-1)(state, () => dispatched++)).toBe(true);
    expect(dispatched).toBe(0);
  });

  it("indents an ordinary paragraph too", () => {
    const state = run(light.state(three, [1, 0]), indent(1));
    expect(textOf(state, three).paragraphs.map((q) => q.level)).toEqual([undefined, 1, undefined]);
  });
});

describe("Enter, Shift-Enter and Backspace", () => {
  it("splits a paragraph at the caret", () => {
    const base = text(p({ t: "Hello world" }));
    const state = run(light.state(base, [0, 5]), enter);
    expect(textOf(state, base).paragraphs).toEqual([{ runs: [{ t: "Hello" }] }, { runs: [{ t: " world" }] }]);
    expect(state.selection.from).toBe(position(state, 1, 0));
  });

  it("replaces a selection with the break", () => {
    const base = text(p({ t: "Hello world" }));
    const state = run(light.state(base, [0, 2], [0, 8]), enter);
    expect(textOf(state, base).paragraphs).toEqual([{ runs: [{ t: "He" }] }, { runs: [{ t: "rld" }] }]);
  });

  it("gives the new paragraph the settings of the old one, so a list goes on", () => {
    const base = text({ runs: [{ t: "item" }], list: "number", level: 1, align: "center", lineSpacing: 1.5, step: 2, bullet: "x" } as Paragraph);
    const state = run(light.state(base, [0, 4]), enter);
    const paragraphs = textOf(state, base).paragraphs;
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1]).toEqual({ runs: [{ t: "" }], list: "number", level: 1, align: "center", lineSpacing: 1.5, step: 2, bullet: "x" });
  });

  it("carries the formatting at the caret into the new paragraph", () => {
    const base = text(p({ t: "bold", b: true, size: 30 }));
    const state = typeIn(run(light.state(base, [0, 4]), enter), "x");
    expect(textOf(state, base).paragraphs).toEqual([{ runs: [{ t: "bold", b: true, size: 30 }] }, { runs: [{ t: "x", b: true, size: 30 }] }]);
  });

  it("does not carry a link into the new paragraph", () => {
    const base = text(p({ t: "link", link: "https://x.y" }));
    const state = typeIn(run(light.state(base, [0, 4]), enter), "x");
    expect(textOf(state, base).paragraphs[1]).toEqual({ runs: [{ t: "x" }] });
  });

  it("ends the list at an empty list item", () => {
    const base = text({ runs: [{ t: "a" }], list: "bullet" }, { runs: [{ t: "" }], list: "bullet", level: 2 });
    const state = run(light.state(base, [1, 0]), enter);
    expect(textOf(state, base).paragraphs).toEqual([{ runs: [{ t: "a" }], list: "bullet" }, { runs: [{ t: "" }] }]);
  });

  it("splits an empty plain paragraph into two", () => {
    const base = text(p({ t: "" }));
    expect(textOf(run(light.state(base, [0, 0]), enter), base).paragraphs).toHaveLength(2);
  });

  it("puts a line break in the text with Shift-Enter", () => {
    const base = text(p({ t: "Hello world", b: true }));
    const state = run(light.state(base, [0, 5]), softBreak);
    expect(textOf(state, base).paragraphs).toEqual([{ runs: [{ t: "Hello\n world", b: true }] }]);
    expect(state.selection.from).toBe(position(state, 0, 6));
  });

  it("takes the bullet away with Backspace at the start of a list item", () => {
    const base = text({ runs: [{ t: "item" }], list: "bullet", level: 1 });
    const state = run(light.state(base, [0, 0]), backspaceListStart);
    expect(textOf(state, base).paragraphs).toEqual([{ runs: [{ t: "item" }] }]);
  });

  it("leaves Backspace to the editor elsewhere", () => {
    const base = text({ runs: [{ t: "item" }], list: "bullet" }, p({ t: "plain" }));
    expect(backspaceListStart(light.state(base, [0, 2]))).toBe(false);
    expect(backspaceListStart(light.state(base, [1, 0]))).toBe(false);
    expect(backspaceListStart(light.state(base, [0, 0], [0, 2]))).toBe(false);
  });
});

describe("typing a list marker", () => {
  const empty = text(p({ t: "" }));
  const typed = (chars: string, base: Text = empty) => {
    let state = light.state(base, [0, 0]);
    state = typeIn(state, chars);
    return listRule(state, state.selection.from, state.selection.from, " ");
  };

  it("makes a bullet item of a paragraph that starts with `- ` or `* `", () => {
    for (const marker of ["-", "*"]) {
      const state = typeIn(light.state(empty, [0, 0]), marker);
      const tr = listRule(state, state.selection.from, state.selection.from, " ");
      expect(tr, marker).not.toBeNull();
      const after = state.apply(tr!);
      expect(textOf(after, empty).paragraphs, marker).toEqual([{ runs: [{ t: "" }], list: "bullet" }]);
      expect(after.selection.from).toBe(position(after, 0, 0));
    }
  });

  it("makes a numbered item of one that starts with `1. `", () => {
    const state = typeIn(light.state(empty, [0, 0]), "12.");
    const after = state.apply(listRule(state, state.selection.from, state.selection.from, " ")!);
    expect(textOf(after, empty).paragraphs).toEqual([{ runs: [{ t: "" }], list: "number" }]);
  });

  it("keeps the words after the marker", () => {
    const base = text(p({ t: "-hello" }));
    const state = light.state(base, [0, 1]);
    const after = state.apply(listRule(state, state.selection.from, state.selection.from, " ")!);
    expect(textOf(after, base).paragraphs).toEqual([{ runs: [{ t: "hello" }], list: "bullet" }]);
  });

  it("is just a space anywhere else", () => {
    expect(typed("a-")).toBeNull();
    expect(typed("- a")).toBeNull();
    expect(typed("1")).toBeNull();
    expect(typed("1.5")).toBeNull();
    expect(typed("--")).toBeNull();
    const state = typeIn(light.state(empty, [0, 0]), "-");
    expect(listRule(state, 2, 2, "x")).toBeNull();
    expect(listRule(state, 1, 2, " ")).toBeNull();
    const already = text({ runs: [{ t: "-" }], list: "number" });
    const inList = light.state(already, [0, 1]);
    expect(listRule(inList, 2, 2, " ")).toBeNull();
  });

});
