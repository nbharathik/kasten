// Random texts to try the outline's writer against the engine's reader: a text
// written as Markdown and read back must be the text it was, as a person sees
// it (the words, and the looks, links, lists and styles on them), and the
// Markdown written from what was read back must be the Markdown it was.
//
// The texts are full of the things that trip a reader: punctuation beside
// marks, words with stars, underscores, brackets, dollars and backslashes,
// marked words that touch, links with parentheses, code with backticks, hard
// breaks, and lists at several levels.

import type { Paragraph, Run, Text } from "@kasten-slides/wasm";

import { textToMarkdown } from "./markdown.ts";

/** A small random number generator, so that a failing text can be run again. */
export function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const WORDS = ["alpha", "Beta", "x", "snake_case", "a*b", "2 * 3", "[maybe]", "(paren)", "<tag>", "<u>", "$5", "$", "~", "~~", "`tick`", "back\\slash", "\\", "#", "1.", "- dash", "+ plus", "> quote", "é ü ñ", "日本語", "https://example.com/a_(b)", "a  b", "end.", "50%", "_under_", "*star*", "**two**", "a_b_c", "_", "*", "a[b]c", "](", "1)", "10. ten", "--", "|pipe|", "&amp;", "'q'", '"dq"'];
const URLS = ["https://example.com", "https://a.b/c_(d)", "mailto:me@example.com", "slide:s-12345678", "https://x.y/?q=1&r=(2)"];
const CODE = ["map()", "a`b", "x  y", "`", " pad ", "a``b`c"];
const MATH = ["x^2", "a+b", "f(x)", "\\alpha", "a$b"];
const LINES = ["let a = 1;", "```", "x  y", "  indented", "a`b", "", "- not a bullet", "# not a heading"];

function run(next: () => number): Run {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const roll = next();
  if (roll < 0.08) return { t: pick(MATH), math: true };
  if (roll < 0.16) return { t: pick(CODE), code: true };
  const made: Run = { t: pick(WORDS) + (next() < 0.5 ? ` ${pick(WORDS)}` : "") };
  if (next() < 0.2) made.t = ` ${made.t}`;
  if (next() < 0.2) made.t = `${made.t} `;
  if (next() < 0.08) made.t = made.t.replace(" ", "\n");
  if (next() < 0.25) made.b = true;
  if (next() < 0.25) made.i = true;
  if (next() < 0.1) made.s = true;
  if (next() < 0.1) made.u = true;
  if (next() < 0.15) made.link = pick(URLS);
  return made;
}

function paragraph(next: () => number): Paragraph {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
  const kind = next();
  if (kind >= 0.65 && kind < 0.72) return { runs: [{ t: pick(LINES) }], style: "code" };
  if (kind >= 0.72 && kind < 0.75) return { runs: [{ t: "" }], list: pick(["bullet", "number"] as const), level: Math.floor(next() * 3) };
  const made: Paragraph = { runs: Array.from({ length: 1 + Math.floor(next() * 4) }, () => run(next)) };
  if (kind < 0.35) {
    made.list = "bullet";
    made.level = Math.floor(next() * 4);
  } else if (kind < 0.55) {
    made.list = "number";
    made.level = Math.floor(next() * 3);
  } else if (kind < 0.65) {
    made.style = pick(["title", "subtitle", "quote"]);
  }
  return made;
}

/** A random text of one to four paragraphs. */
export function randomText(next: () => number): Text {
  return { paragraphs: Array.from({ length: 1 + Math.floor(next() * 4) }, () => paragraph(next)) };
}

// ---- what a person sees of a text

const isSpace = (c: string) => /\s/.test(c);

/**
 * A text reduced to what can be told apart on a slide, one line for each
 * paragraph. Space at the ends of a paragraph and next to a line break is not
 * kept by a reader, marks do not show on space, and a link on a line break
 * cannot be seen, so those are left out; and a text of one empty paragraph,
 * such as a slot nobody has typed into, is no text.
 */
export function seen(text: Text): string[] {
  const paragraphs = text.paragraphs ?? [];
  if (paragraphs.length === 1 && (paragraphs[0]!.runs ?? []).every((r) => (r.t ?? "").trim() === "")) return [];
  return paragraphs
    .map((p) => {
      const cells: { ch: string; look: string }[] = [];
      for (const r of p.runs ?? []) {
        for (const ch of r.t ?? "") {
          const marks = isSpace(ch) ? "" : `${r.b ? "b" : ""}${r.i ? "i" : ""}${r.s ? "s" : ""}${r.u ? "u" : ""}`;
          cells.push({ ch, look: `${marks}|${r.code ? "c" : ""}${r.math ? "m" : ""}|${ch === "\n" ? "" : (r.link ?? "")}` });
        }
      }
      const keep = cells.filter((cell, at) => !(isSpace(cell.ch) && cell.ch !== "\n" && (cells[at - 1]?.ch === "\n" || cells[at + 1]?.ch === "\n")));
      let from = 0;
      let to = keep.length;
      while (from < to && isSpace(keep[from]!.ch)) from++;
      while (to > from && isSpace(keep[to - 1]!.ch)) to--;
      const words = keep.slice(from, to).map((cell) => `${cell.ch}❘${cell.look}`).join("");
      return { p, words };
    })
    .filter(({ p, words }) => words !== "" || p.list || p.style)
    .map(({ p, words }) => `${p.list ?? "-"}:${p.list ? (p.level ?? 0) : 0}:${p.list ? "-" : (p.style ?? "-")}:${words}`);
}

export interface Disagreement {
  markdown: string;
  before: string[];
  after: string[];
}

/** The texts, out of `count` from `seed`, that are not the same read back, and those whose Markdown changes when written again. */
export function disagreements(read: (markdown: string) => Text, seed: number, count: number): { different: Disagreement[]; unsteady: string[] } {
  const next = random(seed);
  const different: Disagreement[] = [];
  const unsteady: string[] = [];
  for (let n = 0; n < count; n++) {
    const text = randomText(next);
    const markdown = textToMarkdown(text);
    const back = read(markdown);
    const before = seen(text);
    const after = seen(back);
    if (JSON.stringify(before) !== JSON.stringify(after)) different.push({ markdown, before, after });
    const again = textToMarkdown(back);
    if (again !== markdown) unsteady.push(`${JSON.stringify(markdown)}\n${JSON.stringify(again)}`);
  }
  return { different, unsteady };
}
