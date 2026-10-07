// The outline reads a text as Markdown (`textToMarkdown`) and writes it back
// with the engine's `set_text`. These check that the two agree: Markdown that
// is already in the form the outline writes must come back as it went in.
//
// `set_text` reads each line as a plain paragraph until the Markdown parser
// is in it. The first group holds for that too; the second needs the parser
// and runs by itself once the engine has it.

import type { Text } from "@kasten-slides/wasm";
import { describe, expect, it } from "vitest";

import { openDeck, parserIsIn } from "../filmstrip/test-support.ts";
import { textToMarkdown } from "./markdown.ts";
import { setMarkdown } from "./write.ts";

/** A body (whose slot makes bullets) and a plain text box, each set to `markdown` and read back through the outline's own reading. */
async function through(markdown: string): Promise<{ body: string; box: string; text: Text }> {
  const { session, engine } = await openDeck({ slides: 2 });
  const slide = session.deck.slides[1]!;
  const bodyId = slide.elements.find((e) => e.placeholder === "body")!.id;
  const boxId = engine.apply("add_elements", { slide: slide.id, elements: [{ type: "text", id: "", x: 10, y: 10, w: 300, h: 100, text: { paragraphs: [{ runs: [{ t: "" }] }] } }] as never }).output.ids[0]!;
  expect(setMarkdown(session, slide.id, bodyId, markdown)).toBe(true);
  expect(setMarkdown(session, slide.id, boxId, markdown)).toBe(true);
  const read = (id: string) => (session.deck.slides[1]!.elements.find((e) => e.id === id) as { text: Text }).text;
  return { body: textToMarkdown(read(bodyId)), box: textToMarkdown(read(boxId)), text: read(bodyId) };
}

describe("Markdown through set_text, in the ways that hold whatever the parser", () => {
  it("brings plain lines back as they went in: bullets in a body, plain in a text box", async () => {
    const { body, box } = await through("First point\nSecond point");
    expect(body).toBe("- First point\n- Second point");
    expect(box).toBe("First point\nSecond point");
  });

  it("brings one line back", async () => {
    const { body, box } = await through("Only");
    expect(body).toBe("- Only");
    expect(box).toBe("Only");
  });

  it("leaves out blank lines, since they say nothing", async () => {
    const { body } = await through("One\n\n\nTwo\n");
    expect(body).toBe("- One\n- Two");
  });

  it("empties a text", async () => {
    const { body, box } = await through("");
    expect(body).toBe("");
    expect(box).toBe("");
  });

  it("is the same after being written again", async () => {
    const first = await through("Alpha\nBeta\nGamma");
    const again = await through(first.box);
    expect(again.box).toBe(first.box);
    expect(again.body).toBe("- Alpha\n- Beta\n- Gamma");
  });
});

// Once `set_text` reads Markdown, what the outline writes must be what it reads.
const parser = await parserIsIn();

describe.skipIf(!parser)("Markdown through set_text, once the parser is in", () => {
  const same: [string, string][] = [
    ["bullets", "- one\n- two"],
    ["levels", "- one\n  - nested\n    - deeper\n- back"],
    ["a break in a bullet", "- one\\\n  two"],
    ["a formula", "- the square $x^2$ of it"],
    ["words that look like markup", "- 2 \\* 3 = \\*6\\*\n- snake_case_name\n- use \\`ls\\`\n- \\[not a link](x)"],
    ["a start that looks like a list, in a bullet and out of one", "- 1. Intro\n- - dash"],
    ["looks", "- **bold** and *italic* and ~~strike~~ and <u>under</u>"],
    ["looks in a look", "- ***both*** and **bold** ***and italic***"],
    ["marks that would not be read", "- a<b>(b)</b>c and **a**<i>b</i>"],
    ["code and links", "- `code` and [a link](https://example.com) and <https://example.com>"],
    ["a link with looks", "- [**bold** and plain](https://example.com/a)"],
  ];
  for (const [name, markdown] of same) {
    it(`brings ${name} back as they went in`, async () => {
      expect((await through(markdown)).body).toBe(markdown);
    });
  }

  it("brings numbers back, counting them", async () => {
    expect((await through("1. first\n2. second\n  1. inner\n3. third")).body).toBe("1. first\n2. second\n  1. inner\n3. third");
  });

  it("brings plain paragraphs of a text box back, and headings, quotes and code", async () => {
    expect((await through("**bold** start\nplain second line\\\nwith a break")).box).toBe("**bold** start\nplain second line\\\nwith a break");
    expect((await through("# Big\n## Smaller\n> Said\nplain")).box).toBe("# Big\n## Smaller\n> Said\nplain");
    expect((await through("Run it:\n```\nlet a = 1;\nrun(a);\n```\nDone")).box).toBe("Run it:\n```\nlet a = 1;\nrun(a);\n```\nDone");
  });

  it("brings an empty item back as its marker", async () => {
    expect((await through("- one\n-\n- two")).body).toBe("- one\n-\n- two");
  });

  it("reads bullets, levels and looks into the runs", async () => {
    const { text } = await through("- one\n  - **two** and `three`\n1. four");
    expect(text.paragraphs.map((p) => [p.list, p.level ?? 0, p.runs.map((r) => r.t).join("")])).toEqual([
      ["bullet", 0, "one"],
      ["bullet", 1, "two and three"],
      ["number", 0, "four"],
    ]);
    expect(text.paragraphs[1]!.runs.map((r) => [r.b === true, r.code === true])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ]);
  });
});
