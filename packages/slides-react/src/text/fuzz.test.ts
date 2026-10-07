import type { Paragraph, Run, Text, Theme } from "@kasten-slides/wasm";
import { redo, undo } from "prosemirror-history";
import { TextSelection } from "prosemirror-state";
import { beforeAll, describe, expect, it } from "vitest";

import { backspaceListStart, enter, indent, setAlign, setLineSpacing, softBreak, toggleList } from "./block-commands.ts";
import { docToText, nodeToParagraph, textToDoc } from "./convert.ts";
import { formatStateOf } from "./format-state.ts";
import { hexOf } from "../theme/index.ts";
import { type Command, clearFormatting, setLink, setValueMark, stepFontSize, toggleFlag } from "./mark-commands.ts";
import { parseHtml, parseText } from "./paste-html.ts";
import { pasteSlice } from "./paste.ts";
import { type Rig, rig } from "./test-state.ts";
import { themeNamed } from "./test-support.ts";
import { paragraphFlowCss } from "./text-style.ts";

let theme: Theme;
let light: Rig;

beforeAll(async () => {
  theme = await themeNamed("Light");
  light = rig(theme, "body");
});

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, items: readonly T[]): T => items[Math.floor(r() * items.length)] as T;

const WORDS = ["", "a", "Hello world", "  spaced  ", "line\nbreak", "日本語", "😀", "x".repeat(40)];
const HTML = ["<p>one <b>two</b></p>", "<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>", "<div><br></div>", "<p>plain</p><p>two</p>", '<a href="https://x.y">link</a> text', "<pre>a\n\nb</pre>", ""];

function randomText(r: () => number): Text {
  const paragraphs: Paragraph[] = Array.from({ length: 1 + Math.floor(r() * 4) }, () => {
    const runs: Run[] = Array.from({ length: 1 + Math.floor(r() * 3) }, () => {
      const run: Run = { t: pick(r, WORDS) };
      if (r() < 0.3) run.b = true;
      if (r() < 0.2) run.color = pick(r, ["accent1", "text2", "#12ab34"]);
      if (r() < 0.2) run.size = pick(r, [10, 16, 40]);
      if (r() < 0.15) run.link = "https://example.com";
      if (r() < 0.1) run.code = true;
      return run;
    });
    const paragraph: Paragraph = { runs };
    if (r() < 0.4) paragraph.list = pick(r, ["bullet", "number"] as const);
    if (r() < 0.3) paragraph.level = Math.floor(r() * 3);
    if (r() < 0.2) paragraph.align = pick(r, ["left", "center", "right", "justify"] as const);
    return paragraph;
  });
  return { paragraphs };
}

function operations(r: () => number): Command[] {
  const flags = ["bold", "italic", "underline", "strike", "code"] as const;
  return [
    toggleFlag(pick(r, flags), light.ctx),
    setValueMark("color", pick(r, ["accent2", "#ff0000", null])),
    setValueMark("size", pick(r, [12, 20, 44, null])),
    setValueMark("font", pick(r, ["Georgia", "code", null])),
    setLink(pick(r, ["https://x.y", "slide:s-1", null])),
    stepFontSize(pick(r, [1, -1, 2]), light.ctx),
    setAlign(pick(r, ["left", "center", "right", "justify"] as const)),
    setLineSpacing(pick(r, [1, 1.5, null])),
    toggleList(pick(r, ["bullet", "number"] as const)),
    indent(pick(r, [1, -1] as const)),
    enter,
    softBreak,
    backspaceListStart,
    clearFormatting,
    undo,
    redo,
    (state, dispatch) => {
      dispatch?.(state.tr.deleteSelection());
      return true;
    },
    (state, dispatch) => {
      dispatch?.(state.tr.insertText(pick(r, WORDS) || "z"));
      return true;
    },
    (state, dispatch) => {
      const paragraphs = r() < 0.5 ? parseText(pick(r, ["one\ntwo\nthree", "single", "\n\n"])) : parseHtml(pick(r, HTML));
      const slice = pasteSlice(paragraphs, state, "html");
      if (slice) dispatch?.(state.tr.replaceSelection(slice));
      return true;
    },
  ];
}

const validColor = (color: string): boolean => hexOf(theme, color) !== null;

describe("editing at random", () => {
  it("never leaves a document that is not valid, a text the deck would refuse, or a round trip that changes it", () => {
    for (let seed = 1; seed <= 150; seed++) {
      const r = random(seed);
      const start = randomText(r);
      let state = light.state(start);
      let base = start;
      const trail: string[] = [];
      for (let step = 0; step < 25; step++) {
        // A random selection: a caret or a range.
        const positions: number[] = [];
        state.doc.descendants((node, pos) => {
          if (node.isTextblock) for (let offset = 0; offset <= node.content.size; offset++) positions.push(pos + 1 + offset);
        });
        const a = pick(r, positions);
        const b = r() < 0.5 ? a : pick(r, positions);
        state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, a, b)));
        const ops = operations(r);
        const index = Math.floor(r() * ops.length);
        trail.push(String(index));
        const command = ops[index] as Command;
        try {
          command(state, (tr) => {
            state = state.apply(tr);
          });
          state.doc.check();
          formatStateOf(state, light.ctx);
          state.doc.forEach((node) => paragraphFlowCss(theme, "body", nodeToParagraph(node)));
        } catch (error) {
          throw new Error(`seed ${seed}, operations ${trail.join(",")}: ${String(error)}`, { cause: error });
        }
        const text = docToText(state.doc, base);
        base = text;
        // The deck refuses colours that are not a token or a hex value, and sizes that are not above 0.
        for (const paragraph of text.paragraphs) {
          expect(paragraph.runs.length, `seed ${seed} ${trail.join(",")}`).toBeGreaterThan(0);
          for (const run of paragraph.runs) {
            if (run.color != null) expect(validColor(run.color), `seed ${seed} colour ${run.color}`).toBe(true);
            if (run.size != null) expect(run.size, `seed ${seed}`).toBeGreaterThan(0);
            expect(typeof run.t).toBe("string");
          }
        }
        expect(textToDoc(text, light.schema).eq(state.doc), `seed ${seed}, operations ${trail.join(",")}`).toBe(true);
      }
    }
  });
});
