// Writing the looks of a line: `**`, `*`, `~~` and `<u>`, or a tag (`<b>`,
// `<i>`, `<s>`) where a mark would not be read. The engine reads marks the way
// CommonMark does, which refuses them in some places (a `**` right before a
// letter, beside punctuation, two runs that touch), and a mark it refuses is
// left in the words. A tag is always read. So each look is written with its
// mark when that is read back as written, and with its tag when it is not.

import { BOLD, type Delim, ITALIC, STRIKE, type Token, UNDER, flanking, readsBack } from "./emphasis.ts";

export type Look = "s" | "u" | "b" | "i";

/** The looks Markdown can write, outermost first. */
export const LOOKS: readonly Look[] = ["s", "u", "b", "i"];
const MARK: Record<Look, string> = { s: "~~", u: "<u>", b: "**", i: "*" };
const TAG: Record<Look, [string, string]> = { s: ["<s>", "</s>"], u: ["<u>", "</u>"], b: ["<b>", "</b>"], i: ["<i>", "</i>"] };
const BITS: Record<Look, number> = { s: STRIKE, u: UNDER, b: BOLD, i: ITALIC };

/** One step in writing a group: text (already escaped), or a look opening or closing. */
export type Step = { kind: "text"; text: string } | { kind: "open" | "close"; span: number };

interface Written {
  out: string;
  /** Where each span's opening and closing mark starts in `out`. */
  opens: number[];
  closes: number[];
  /** Spans whose opening mark comes right after a closing mark of the same kind, which would run into it. */
  touching: number[];
}

function write(steps: readonly Step[], spans: readonly Look[], tagged: ReadonlySet<number>): Written {
  const written: Written = { out: "", opens: [], closes: [], touching: [] };
  let closedAt = -1;
  let closedWith = "";
  for (const step of steps) {
    if (step.kind === "text") {
      written.out += step.text;
      continue;
    }
    const look = spans[step.span]!;
    const tag = tagged.has(step.span);
    if (step.kind === "open") {
      const mark = tag ? TAG[look][0] : MARK[look];
      if (!tag && closedAt === written.out.length && closedWith === mark[0]) written.touching.push(step.span);
      written.opens[step.span] = written.out.length;
      written.out += mark;
    } else {
      const mark = tag ? TAG[look][1] : MARK[look];
      written.closes[step.span] = written.out.length;
      written.out += mark;
      closedAt = written.out.length;
      closedWith = tag ? "" : mark[0]!;
    }
  }
  return written;
}

/** Whether the character at `at` is escaped by backslashes before it. */
function escapedAt(out: string, at: number): boolean {
  let slashes = 0;
  for (let k = at - 1; k >= 0 && out[k] === "\\"; k--) slashes += 1;
  return slashes % 2 === 1;
}

/** The run of marks that the mark at `at` is part of: where it starts and ends. */
function runAround(out: string, at: number, length: number): { from: number; to: number } {
  const mark = out[at]!;
  let from = at;
  while (from > 0 && out[from - 1] === mark && !escapedAt(out, from - 1)) from -= 1;
  let to = at + length;
  while (to < out.length && out[to] === mark) to += 1;
  return { from, to };
}

/** The spans written with marks that the reader would not take for marks where they stand, by the rules for where a run may open or close. */
function refused(written: Written, spans: readonly Look[], tagged: ReadonlySet<number>): number[] {
  return spans.flatMap((look, span) => {
    if (tagged.has(span)) return [];
    const length = MARK[look].length;
    const start = runAround(written.out, written.opens[span]!, length);
    const end = runAround(written.out, written.closes[span]!, length);
    const opens = flanking(written.out[start.from - 1], written.out[start.to]).open;
    const closes = flanking(written.out[end.from - 1], written.out[end.to]).close;
    // Strike-through is a run of exactly two tildes; a third beside it is words.
    const whole = look !== "s" || (start.to - start.from === 2 && end.to - end.from === 2);
    return opens && closes && whole ? [] : [span];
  });
}

/** The tokens of the line as the reader will see them: the words with the looks meant for them, and the runs of marks and tags. */
function tokensOf(steps: readonly Step[], spans: readonly Look[], tagged: ReadonlySet<number>, out: string): Token[] {
  const tokens: Token[] = [];
  const runs: { delim: Delim; from: number }[] = [];
  let looks = 0;
  let pos = 0;
  let run: { delim: Delim; from: number; char: string } | null = null;
  for (const step of steps) {
    if (step.kind === "text") {
      tokens.push({ kind: "text", looks });
      pos += step.text.length;
      run = null;
      continue;
    }
    const look = spans[step.span]!;
    const opening = step.kind === "open";
    if (tagged.has(step.span)) {
      const mark = TAG[look][opening ? 0 : 1];
      tokens.push({ kind: "mark", delim: { kind: "tag", tag: look, opening, n: 1, left: 1, open: opening, close: !opening, at: tokens.length } });
      pos += mark.length;
      run = null;
    } else {
      const mark = MARK[look];
      if (run && run.char === mark[0] && run.delim.n > 0 && pos === run.from + run.delim.n) {
        run.delim.n += mark.length;
        run.delim.left = run.delim.n;
      } else {
        const delim: Delim = { kind: look === "s" ? "tilde" : "star", n: mark.length, left: mark.length, open: false, close: false, at: tokens.length };
        run = { delim, from: pos, char: mark[0]! };
        runs.push(run);
        tokens.push({ kind: "mark", delim });
      }
      pos += mark.length;
    }
    looks = opening ? looks | BITS[look] : looks & ~BITS[look];
  }
  // A run may open or close by what is beside it once all its marks are in.
  for (const { delim, from } of runs) {
    const { open, close } = flanking(out[from - 1], out[from + delim.n]);
    const ok = delim.kind !== "tilde" || delim.n === 2;
    delim.open = ok && open;
    delim.close = ok && close;
  }
  return tokens;
}

/**
 * The steps written out. Every look gets its mark to begin with, and a tag
 * where the mark is refused by the rules for a run of marks, where it would
 * touch one that has just closed, or where the line as a whole would be read
 * back with other looks than it was written for.
 */
export function writeSteps(steps: readonly Step[], spans: readonly Look[]): string {
  // Underline has no mark of its own: it is always a tag.
  const tagged = new Set(spans.flatMap((look, span) => (look === "u" ? [span] : [])));
  for (let round = 0; round <= spans.length; round++) {
    const written = write(steps, spans, tagged);
    const bad = [...written.touching, ...refused(written, spans, tagged)];
    if (bad.length === 0) {
      if (readsBack(tokensOf(steps, spans, tagged, written.out))) return written.out;
      break;
    }
    for (const span of bad) tagged.add(span);
  }
  return write(steps, spans, new Set(spans.keys())).out;
}
