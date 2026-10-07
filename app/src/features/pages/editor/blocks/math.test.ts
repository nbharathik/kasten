// Math in pages: `$…$` inline and `$$…$$` on lines of their own, read as
// Pandoc and Obsidian read them (a price stays a price), drawn with KaTeX,
// typed with input rules, and written back byte for byte.

import type { Node } from "@milkdown/kit/prose/model";
import { describe, expect, it } from "vitest";

import { useTestEditor } from "../../../../test/editor";
import { mathOpenings, validInline } from "./math-remark";

const editor = useTestEditor();

const nodes = (type: string): Node[] => {
  const found: Node[] = [];
  editor.doc.descendants((node) => void (node.type.name === type && found.push(node)));
  return found;
};

describe("which dollars are math", () => {
  it("follows Pandoc: no space inside the dollars, no digit after the closing one", () => {
    expect(validInline("$E = mc^2$", "")).toBe(true);
    expect(validInline("$x$", "z")).toBe(true);
    expect(validInline("$5 and $", "1")).toBe(false);
    expect(validInline("$ x$", "")).toBe(false);
    expect(validInline("$x$", "5")).toBe(false);
    expect(validInline("$$ x + y $$", "")).toBe(true);
    expect(validInline("$$", "")).toBe(false);
  });

  it("finds the dollars in plain text that would open math", () => {
    expect(mathOpenings("costs $5 and $10")).toEqual([]);
    expect(mathOpenings("a $x$ b")).toEqual([2]);
    expect(mathOpenings("x$y$z and $a$-$b$")).toEqual([1, 10, 14]);
    expect(mathOpenings("just $ one")).toEqual([]);
  });
});

describe("inline math", () => {
  it("reads math and leaves prices as text, saving both unchanged", () => {
    const body = "Area $\\pi r^2$ here. Prices like $5 and $10 are not math.\n";
    editor.open(body);
    expect(nodes("math_inline").map((n) => n.attrs.value)).toEqual(["\\pi r^2"]);
    expect(editor.doc.textContent).toContain("Prices like $5 and $10 are not math.");
    expect(editor.view.dom.querySelector(".kasten-math .katex")).toBeTruthy();
    expect(editor.save()).toBe(body);
  });

  it("writes math and prices back after an edit, with no stray escapes", () => {
    editor.open("Cost $5 and $10, area $\\pi r^2$.\n").caret("Cost").type("New ");
    expect(editor.save()).toBe("New Cost $5 and $10, area $\\pi r^2$.\n");
  });

  it("keeps double dollars inline as they were", () => {
    editor.open("See $$ a + b $$ inline.\n").caret("See").type("New ");
    expect(editor.save()).toBe("New See $$ a + b $$ inline.\n");
  });

  it("reads dollars across the lines of a quote or list without the quote's marks", () => {
    editor.open("> Lunch $12 and the\n> taxi $30.\n");
    expect(nodes("math_inline")).toEqual([]);
    expect(editor.doc.textContent).toBe("Lunch $12 and the\ntaxi $30.");
    editor.caret("Lunch").type("New ");
    expect(editor.save()).toBe("> New Lunch $12 and the\n> taxi $30.\n");
    editor.caret("New ", true).type("x");
    expect(editor.save()).toBe("> New xLunch $12 and the\n> taxi $30.\n");

    editor.open("- Sum $a +\n  b$ done\n");
    expect(nodes("math_inline").map((n) => n.attrs.value)).toEqual(["a +\nb"]);
    editor.open("> Sum $a +\n> b$ done\n");
    expect(nodes("math_inline").map((n) => n.attrs.value)).toEqual(["a +\nb"]);
    // Spaces inside the dollars stay the text they were.
    editor.open("> Odd $ a\n> b $ here\n");
    expect(nodes("math_inline")).toEqual([]);
    expect(editor.doc.textContent).toBe("Odd $ a\nb $ here");
  });

  it("escapes text that would otherwise read as math", () => {
    editor.open("A \\$x\\$ literal.\n").caret("A").type("New ");
    const saved = editor.save();
    editor.open(saved);
    expect(nodes("math_inline")).toHaveLength(0);
    expect(editor.doc.textContent).toBe("New A $x$ literal.");
  });

  it("turns $…$ into math as you type, but not a price", () => {
    editor.open("\n").type("Area is $a^2$");
    expect(nodes("math_inline").map((n) => n.attrs.value)).toEqual(["a^2"]);
    editor.open("\n").type("From $5 to $");
    expect(nodes("math_inline")).toHaveLength(0);
    expect(editor.doc.textContent).toBe("From $5 to $");
  });
});

describe("display math", () => {
  it("reads $$ blocks, draws them, and saves them byte for byte", () => {
    const body = "Before\n\n$$\n\\int_0^1 x^2 \\, dx\n$$\n\nAfter\n";
    editor.open(body);
    expect(nodes("math_block").map((n) => n.textContent)).toEqual(["\\int_0^1 x^2 \\, dx"]);
    expect(editor.view.dom.querySelector(".kasten-math-block .katex-display")).toBeTruthy();
    expect(editor.save()).toBe(body);
  });

  it("writes an edited block as $$ lines", () => {
    editor.open("$$\nx\n$$\n").caret("x", true).type(" + 1");
    expect(editor.save()).toBe("$$\nx + 1\n$$\n");
  });

  it("starts from $$ and a space", () => {
    editor.open("\n").type("$$ ").type("e^{i\\pi}");
    // The editor keeps an empty line after a block, to write below it.
    expect(editor.types()).toEqual(["math_block", "paragraph"]);
    expect(editor.save()).toBe("$$\ne^{i\\pi}\n$$\n");
  });

  it("leaves a latex code fence a code block", () => {
    const body = "```latex\n\\frac{a}{b}\n```\n";
    editor.open(body);
    expect(editor.types()[0]).toBe("code_block");
    expect(editor.save()).toBe(body);
  });
});
