import type { Paragraph, Run, Text } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { guardStart, inlineMarkdown, textToMarkdown, titleMarkdown } from "./markdown.ts";

const r = (t: string, extra: Partial<Run> = {}): Run => ({ t, ...extra });
const p = (runs: Run[] | string, extra: Partial<Paragraph> = {}): Paragraph => ({ runs: typeof runs === "string" ? [r(runs)] : runs, ...extra });
const text = (...paragraphs: Paragraph[]): Text => ({ paragraphs });
const bullet = (words: string, level = 0): Paragraph => p(words, { list: "bullet", level });
const number = (words: string, level = 0): Paragraph => p(words, { list: "number", level });
const styled = (words: string, style: string): Paragraph => p(words, { style });

describe("paragraphs", () => {
  it("writes a plain paragraph as its words, a line each", () => {
    expect(textToMarkdown(text(p("First"), p("Second")))).toBe("First\nSecond");
    expect(textToMarkdown(text(p("Only")))).toBe("Only");
  });

  it("writes bullets with two spaces for each level", () => {
    expect(textToMarkdown(text(bullet("one"), bullet("two", 1), bullet("three", 2), bullet("four")))).toBe("- one\n  - two\n    - three\n- four");
  });

  it("writes numbers the way they are counted, a run at each level", () => {
    const list = text(number("a"), number("x", 1), number("y", 1), number("b"), bullet("c"), number("d"), p("plain"), number("e"));
    expect(textToMarkdown(list)).toBe("1. a\n  1. x\n  2. y\n2. b\n- c\n1. d\nplain\n1. e");
  });

  it("does not count items nested deeper as breaking a numbered run", () => {
    expect(textToMarkdown(text(number("a"), bullet("x", 1), number("b")))).toBe("1. a\n  - x\n2. b");
  });

  it("starts the count again under a shallower item", () => {
    expect(textToMarkdown(text(number("a"), number("x", 1), number("b"), number("y", 1)))).toBe("1. a\n  1. x\n2. b\n  1. y");
  });

  it("takes a missing or odd level as the first, and a very deep one as the deepest that is written", () => {
    expect(textToMarkdown(text({ runs: [r("a")], list: "bullet" }, { runs: [r("b")], list: "bullet", level: null }, { runs: [r("c")], list: "bullet", level: -2 }))).toBe("- a\n- b\n- c");
    expect(textToMarkdown(text(bullet("deep", 8)))).toBe(`${" ".repeat(10)}- deep`);
  });

  it("gives a plain paragraph no indent, whatever its level", () => {
    expect(textToMarkdown(text(p("hello", { level: 3 })))).toBe("hello");
  });

  it("leaves out plain paragraphs with no words, and keeps an empty item as its marker", () => {
    expect(textToMarkdown(text(p("a"), p(""), p([r("")]), p([]), p("   "), p("b")))).toBe("a\nb");
    expect(textToMarkdown(text(bullet("a"), bullet(""), bullet("   "), bullet("b")))).toBe("- a\n-\n-\n- b");
    expect(textToMarkdown(text(number("a"), number(""), number("b")))).toBe("1. a\n2.\n3. b");
  });

  it("says nothing for a text that is a single empty paragraph, as a slot nobody has typed into is", () => {
    expect(textToMarkdown(text())).toBe("");
    expect(textToMarkdown(text(bullet("")))).toBe("");
    expect(textToMarkdown(text(p("")))).toBe("");
    expect(textToMarkdown(text(styled("", "title")))).toBe("");
  });

  it("survives a text without the parts it should have", () => {
    expect(textToMarkdown({} as Text)).toBe("");
    expect(textToMarkdown(text({} as Paragraph))).toBe("");
    expect(textToMarkdown(text({} as Paragraph, p("kept")))).toBe("kept");
  });
});

describe("styles", () => {
  it("writes the title, subtitle and quote styles as a heading or a quote", () => {
    expect(textToMarkdown(text(styled("Big", "title"), styled("Smaller", "subtitle"), styled("Said", "quote"), p("plain")))).toBe("# Big\n## Smaller\n> Said\nplain");
  });

  it("keeps a style and a list apart: a list item is a list item", () => {
    expect(textToMarkdown(text(p("item", { list: "bullet", style: "title" })))).toBe("- item");
  });

  it("writes an empty styled paragraph as its marker", () => {
    expect(textToMarkdown(text(p("a"), styled("", "subtitle"), p("b")))).toBe("a\n##\nb");
  });

  it("ignores a style Markdown has no mark for", () => {
    expect(textToMarkdown(text(styled("small", "caption"), styled("cite", "citation")))).toBe("small\ncite");
  });

  it("writes lines of code as one fence, longer than any run of backticks in it", () => {
    expect(textToMarkdown(text(p("Run it:"), styled("let a = 1;", "code"), styled("run(a);", "code"), p("Done")))).toBe("Run it:\n```\nlet a = 1;\nrun(a);\n```\nDone");
    expect(textToMarkdown(text(styled("echo ```hi```", "code")))).toBe("````\necho ```hi```\n````");
  });

  it("gives code its words and none of its looks", () => {
    expect(textToMarkdown(text(p([r("bold", { b: true }), r(" code")], { style: "code" })))).toBe("```\nbold code\n```");
  });

  it("starts a numbered list again after code", () => {
    expect(textToMarkdown(text(number("a"), styled("x", "code"), number("b")))).toBe("1. a\n```\nx\n```\n1. b");
  });
});

describe("marks and tags", () => {
  it("writes a mark where it is read, beside spaces, punctuation and inside words", () => {
    expect(inlineMarkdown([r("Note:", { b: true }), r(" something")])).toBe("**Note:** something");
    expect(inlineMarkdown([r("un", { b: true }), r("believable")])).toBe("**un**believable");
    expect(inlineMarkdown([r("("), r("bold", { b: true }), r(")")])).toBe("(**bold**)");
    expect(inlineMarkdown([r('"'), r("Quoted", { b: true }), r('"')])).toBe('"**Quoted**"');
    expect(inlineMarkdown([r("Result", { b: true }), r(": 42")])).toBe("**Result**: 42");
  });

  it("writes a tag where the mark would not be read", () => {
    // A mark that opens beside punctuation inside a word.
    expect(inlineMarkdown([r("a"), r("(b)", { b: true }), r("c")])).toBe("a<b>(b)</b>c");
    // Marks that run into one another.
    expect(inlineMarkdown([r("a", { b: true }), r("b", { i: true })])).toBe("**a**<i>b</i>");
    expect(inlineMarkdown([r("a", { i: true }), r("b", { b: true })])).toBe("*a*<b>b</b>");
    // A tilde beside the two that make a strike.
    expect(inlineMarkdown([r("~"), r("x", { s: true })])).toBe("~<s>x</s>");
  });

  it("writes tags for a line whose marks would be paired the wrong way, whole", () => {
    expect(inlineMarkdown([r("é ü ñ", { b: true, i: true }), r("(paren)", { b: true }), r("*", { b: true, i: true })])).toBe("<b><i>é ü ñ</i>(paren)<i>\\*</i></b>");
  });
});

describe("looks", () => {
  it("writes bold, italic, strike and underline", () => {
    expect(inlineMarkdown([r("a", { b: true }), r(" "), r("b", { i: true }), r(" "), r("c", { s: true }), r(" "), r("d", { u: true })])).toBe("**a** *b* ~~c~~ <u>d</u>");
  });

  it("writes code, a formula and a link", () => {
    expect(inlineMarkdown([r("Use "), r("map()", { code: true }), r(" for "), r("x^2", { math: true }), r(", see "), r("the docs", { link: "https://example.com/docs" })])).toBe("Use `map()` for $x^2$, see [the docs](https://example.com/docs)");
  });

  it("nests looks in one order, and joins runs that look alike", () => {
    expect(inlineMarkdown([r("both", { b: true, i: true })])).toBe("***both***");
    expect(inlineMarkdown([r("a", { b: true }), r("b", { b: true }), r("c", { b: true })])).toBe("**abc**");
    // Bold, then bold and italic, then bold again.
    expect(inlineMarkdown([r("one ", { b: true }), r("two", { b: true, i: true }), r(" three", { b: true })])).toBe("**one** ***two*** **three**");
    expect(inlineMarkdown([r("x", { b: true, s: true })])).toBe("~~**x**~~");
  });

  it("keeps the spaces at the edge of a marked stretch outside its marks", () => {
    expect(inlineMarkdown([r("Hello ", { b: true }), r("world")])).toBe("**Hello** world");
    expect(inlineMarkdown([r("a"), r("  spaced  ", { i: true }), r("b")])).toBe("a  *spaced*  b");
    expect(inlineMarkdown([r(" ", { b: true }), r("x")])).toBe(" x");
  });

  it("writes a link around marked words", () => {
    expect(inlineMarkdown([r("bold", { b: true, link: "https://a.b" }), r(" and plain", { link: "https://a.b" })])).toBe("[**bold** and plain](https://a.b)");
    expect(inlineMarkdown([r("one", { link: "https://a.b" }), r("two", { link: "https://c.d" })])).toBe("[one](https://a.b)[two](https://c.d)");
  });

  it("escapes the brackets in the words of a link", () => {
    expect(inlineMarkdown([r("see [1]", { link: "https://a.b" })])).toBe("[see \\[1\\]](https://a.b)");
  });

  it("writes the address itself as an autolink", () => {
    expect(inlineMarkdown([r("https://example.com", { link: "https://example.com" })])).toBe("<https://example.com>");
    expect(inlineMarkdown([r("mailto:me@example.com", { link: "mailto:me@example.com" })])).toBe("<mailto:me@example.com>");
    expect(inlineMarkdown([r("example.com", { link: "https://example.com" })])).toBe("[example.com](https://example.com)");
    expect(inlineMarkdown([r("https://", { link: "https://" })])).toBe("[https://](https://)");
  });

  it("writes an address so that it can be read back", () => {
    expect(inlineMarkdown([r("wiki", { link: "https://en.wikipedia.org/wiki/Foo_(bar)" })])).toBe("[wiki](https://en.wikipedia.org/wiki/Foo_\\(bar\\))");
    expect(inlineMarkdown([r("a b", { link: "https://a.b/c d" })])).toBe("[a b](https://a.b/c%20d)");
    expect(inlineMarkdown([r("tab", { link: "https://a.b/c\td" })])).toBe("[tab](https://a.b/c%09d)");
    expect(inlineMarkdown([r("nbsp", { link: "https://a.b/c\u00a0d" })])).toBe("[nbsp](https://a.b/c%C2%A0d)");
    expect(inlineMarkdown([r("slide", { link: "slide:s-12345678" })])).toBe("[slide](slide:s-12345678)");
  });

  it("makes the fence of a code span longer than any run of backticks in it", () => {
    expect(inlineMarkdown([r("a`b", { code: true })])).toBe("``a`b``");
    expect(inlineMarkdown([r("`", { code: true })])).toBe("`` ` ``");
    expect(inlineMarkdown([r(" x ", { code: true })])).toBe("`  x  `");
    expect(inlineMarkdown([r("a", { code: true }), r("b", { code: true })])).toBe("`ab`");
    expect(inlineMarkdown([r("a``b`c", { code: true })])).toBe("```a``b`c```");
  });

  it("puts looks round code, and joins formulas that touch, as a reader would", () => {
    expect(inlineMarkdown([r("f()", { code: true, b: true })])).toBe("**`f()`**");
    expect(inlineMarkdown([r("a", { math: true }), r("b", { math: true })])).toBe("$ab$");
  });

  it("keeps a digit from following a formula directly, where it would not be read as the end of it", () => {
    expect(inlineMarkdown([r("x", { math: true }), r("2 apples")])).toBe("$x$<u></u>2 apples");
    expect(inlineMarkdown([r("x", { math: true }), r(" two")])).toBe("$x$ two");
  });

  it("writes a formula that holds a dollar between two, and one with a space at the edge as words", () => {
    expect(inlineMarkdown([r("a$b", { math: true })])).toBe("$$a$b$$");
    expect(inlineMarkdown([r(" x ", { math: true })])).toBe(" x ");
  });

  it("gives a field its sample", () => {
    expect(inlineMarkdown([r("Page "), r("7", { field: "slideNumber" })])).toBe("Page 7");
  });
});

describe("line breaks", () => {
  it("ends the line with a backslash and indents the next to line up with the words", () => {
    expect(textToMarkdown(text(p([r("one\ntwo")])))).toBe("one\\\ntwo");
    expect(textToMarkdown(text(bullet("one\ntwo"), bullet("three\nfour", 1)))).toBe("- one\\\n  two\n  - three\\\n    four");
  });

  it("keeps the looks on both sides of a break", () => {
    expect(textToMarkdown(text(p([r("one\ntwo", { b: true })])))).toBe("**one**\\\n**two**");
  });

  it("drops a break at either end, and keeps each of a run of them", () => {
    expect(textToMarkdown(text(p([r("\nhello\n")])))).toBe("hello");
    expect(textToMarkdown(text(p([r("a\n\nb")])))).toBe("a\\\n\\\nb");
    expect(textToMarkdown(text(bullet("a\n\nb")))).toBe("- a\\\n  \\\n  b");
  });

  it("leaves out the space beside a break, which a reader does not keep", () => {
    expect(textToMarkdown(text(p([r("a \n b")])))).toBe("a\\\nb");
    expect(textToMarkdown(text(p([r("a "), r("\n"), r(" b", { b: true })])))).toBe("a\\\n**b**");
  });

  it("runs the lines together for a line of one line", () => {
    expect(inlineMarkdown([r("one\ntwo")], { lineBreak: " " })).toBe("one two");
  });
});

describe("words that look like Markdown", () => {
  it("escapes what would start a look, a code span or a formula", () => {
    expect(inlineMarkdown([r("2 * 3 = *6*")])).toBe("2 \\* 3 = \\*6\\*");
    expect(inlineMarkdown([r("use `ls` here")])).toBe("use \\`ls\\` here");
    expect(inlineMarkdown([r("costs $5")])).toBe("costs \\$5");
  });

  it("escapes a bracket that could open a link, and not one that closes nothing", () => {
    expect(inlineMarkdown([r("[not a link](x)")])).toBe("\\[not a link](x)");
    expect(inlineMarkdown([r("a [b")])).toBe("a [b");
    expect(inlineMarkdown([r("a] b")])).toBe("a] b");
  });

  it("escapes a backslash only where it would be taken for an escape", () => {
    expect(inlineMarkdown([r("C:\\temp")])).toBe("C:\\temp");
    expect(inlineMarkdown([r("a\\*b")])).toBe("a\\\\\\*b");
    expect(inlineMarkdown([r("ends\\")])).toBe("ends\\\\");
    expect(inlineMarkdown([r("a\\(b")])).toBe("a\\\\(b");
  });

  it("escapes underscores, except inside a word", () => {
    expect(inlineMarkdown([r("call snake_case_names")])).toBe("call snake_case_names");
    expect(inlineMarkdown([r("_private and trailing_")])).toBe("\\_private and trailing\\_");
    expect(inlineMarkdown([r("a _ b")])).toBe("a \\_ b");
  });

  it("escapes a pair of tildes, and not a single one", () => {
    expect(inlineMarkdown([r("about ~5 minutes")])).toBe("about ~5 minutes");
    expect(inlineMarkdown([r("~~gone~~")])).toBe("\\~\\~gone\\~\\~");
  });

  it("escapes a less-than that could start a tag or an address", () => {
    expect(inlineMarkdown([r("a < b and 1<2")])).toBe("a < b and 1<2");
    expect(inlineMarkdown([r("c<d")])).toBe("c\\<d");
    expect(inlineMarkdown([r("<u>not underlined</u>")])).toBe("\\<u>not underlined\\</u>");
    expect(inlineMarkdown([r("<https://x.y>")])).toBe("\\<https://x.y>");
  });

  it("keeps a line from being read as a list, a heading or a quote", () => {
    expect(textToMarkdown(text(p("1. Intro")))).toBe("1\\. Intro");
    expect(textToMarkdown(text(p("2) Next")))).toBe("2\\) Next");
    expect(textToMarkdown(text(p("- dash")))).toBe("\\- dash");
    expect(textToMarkdown(text(p("+ plus")))).toBe("\\+ plus");
    expect(textToMarkdown(text(p("# Heading")))).toBe("\\# Heading");
    expect(textToMarkdown(text(p("## Two")))).toBe("\\## Two");
    expect(textToMarkdown(text(p("> quoted")))).toBe("\\> quoted");
    expect(textToMarkdown(text(p("-")))).toBe("\\-");
    // Only a start: the same in the middle of a line, or with no space after, is words.
    expect(textToMarkdown(text(p("see 1. above - and # this")))).toBe("see 1. above - and # this");
    expect(textToMarkdown(text(p("1.5 million")))).toBe("1.5 million");
    expect(textToMarkdown(text(p("-1 degrees")))).toBe("-1 degrees");
    expect(textToMarkdown(text(p("#hashtag")))).toBe("#hashtag");
    expect(textToMarkdown(text(p("---")))).toBe("---");
  });

  it("needs no guard after a marker: a list item's words are not read for another marker", () => {
    expect(textToMarkdown(text(bullet("1. inside a bullet")))).toBe("- 1. inside a bullet");
    expect(textToMarkdown(text(styled("- inside a heading", "title")))).toBe("# - inside a heading");
  });

  it("guards a line's start once, however often it is asked to", () => {
    expect(guardStart("1\\. Intro")).toBe("1\\. Intro");
    expect(guardStart(guardStart("- x"))).toBe("\\- x");
  });
});

describe("a title", () => {
  it("is one line: paragraphs and breaks run together, with no list marker", () => {
    expect(titleMarkdown(text(p("Tool use"), p("in models")))).toBe("Tool use in models");
    expect(titleMarkdown(text(p([r("Two\nlines")])))).toBe("Two lines");
    expect(titleMarkdown(text(bullet("Not a bullet")))).toBe("Not a bullet");
    expect(titleMarkdown(text(p(""), p("Second")))).toBe("Second");
    expect(titleMarkdown(text())).toBe("");
  });

  it("keeps the looks, and guards the start", () => {
    expect(titleMarkdown(text(p([r("Why "), r("tools", { b: true }), r("?")])))).toBe("Why **tools**?");
    expect(titleMarkdown(text(p("1. Intro")))).toBe("1\\. Intro");
  });
});
