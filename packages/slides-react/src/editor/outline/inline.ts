// Runs as the Markdown of one line: the words with a backslash before what
// would be read as markup, the looks (see marks.ts), code, formulas, links,
// and line breaks.

import type { Run } from "@kasten-slides/wasm";

import { LOOKS, type Look, type Step, writeSteps } from "./marks.ts";

/** An underline with nothing in it, which reads as nothing and can stand between things that would run together. */
const EMPTY = "<u></u>";

/** What a backslash can go before. */
const ESCAPABLE = "\\*_~`[]()<>$#-+.";

/** One stretch of a paragraph: words, a code span, a formula, or a line break. */
interface Piece {
  kind: "text" | "code" | "math" | "break";
  text: string;
  looks: readonly Look[];
  link: string | null;
}

const isWordChar = (c: string | undefined): boolean => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** The pieces of some runs: line breaks told apart, empty runs dropped, and neighbours that look alike made one. */
function piecesOf(runs: readonly Run[]): Piece[] {
  const pieces: Piece[] = [];
  const push = (piece: Piece) => {
    const last = pieces[pieces.length - 1];
    if (piece.kind === "break") {
      // A break with nothing before it says nothing.
      if (last) pieces.push(piece);
    } else if (last && last.kind === piece.kind && last.link === piece.link && last.looks.join() === piece.looks.join()) {
      last.text += piece.text;
    } else {
      pieces.push(piece);
    }
  };
  for (const run of runs) {
    if (typeof run.t !== "string" || run.t === "") continue;
    const looks = LOOKS.filter((look) => (look === "s" ? run.s : look === "u" ? run.u : look === "b" ? run.b : run.i));
    const link = run.link ? run.link : null;
    if (run.code || run.math) {
      push({ kind: run.code ? "code" : "math", text: run.t, looks, link });
      continue;
    }
    run.t.split("\n").forEach((part, i) => {
      if (i > 0) push({ kind: "break", text: "", looks: [], link: null });
      if (part !== "") push({ kind: "text", text: part, looks, link });
    });
  }
  while (pieces[pieces.length - 1]?.kind === "break") pieces.pop();
  return unspaced(pieces);
}

/** A reader drops the space at the start of a line after a break and at the end of one before it, so it is not written. */
function unspaced(pieces: readonly Piece[]): Piece[] {
  const out: Piece[] = [];
  pieces.forEach((piece, i) => {
    let text = piece.text;
    if (piece.kind === "text") {
      if (pieces[i - 1]?.kind === "break") text = text.trimStart();
      if (pieces[i + 1]?.kind === "break") text = text.trimEnd();
    }
    if (text !== "" || piece.kind === "break") out.push(text === piece.text ? piece : { ...piece, text });
  });
  return out;
}

/** Marks must hug their words: a space at the edge of a marked stretch is moved outside it. */
function hoist(pieces: readonly Piece[]): Piece[] {
  return pieces.flatMap((piece): Piece[] => {
    if (piece.kind !== "text" || piece.looks.length === 0) return [piece];
    const core = piece.text.trim();
    if (core === "") return [{ ...piece, looks: [] }];
    const lead = piece.text.slice(0, piece.text.length - piece.text.trimStart().length);
    const trail = piece.text.slice(lead.length + core.length);
    return [...(lead ? [{ ...piece, text: lead, looks: [] }] : []), { ...piece, text: core }, ...(trail ? [{ ...piece, text: trail, looks: [] }] : [])];
  });
}

/** Words with a backslash before whatever Markdown would take for markup. `inLink` is for the text between the brackets of a link. */
function escapeText(text: string, inLink: boolean): string {
  const lastBracket = text.lastIndexOf("]");
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    const before = text[i - 1];
    const after = text[i + 1];
    let escaped = false;
    // A backslash before a space would be taken for a line break at the end of a line, where the space is dropped.
    if (c === "\\") escaped = after === undefined || /\s/.test(after) || ESCAPABLE.includes(after);
    else if (c === "*" || c === "`" || c === "$") escaped = true;
    // An underscore inside a word is a plain one.
    else if (c === "_") escaped = !(isWordChar(before) && isWordChar(after));
    else if (c === "~") escaped = before === "~" || after === "~";
    else if (c === "[") escaped = inLink || lastBracket > i;
    else if (c === "]") escaped = inLink;
    else if (c === "<") escaped = after === undefined || /[A-Za-z/]/.test(after);
    if (escaped) out += "\\";
    out += c;
  }
  return out;
}

function codeSpan(text: string): string {
  const runs = (text.match(/`+/g) ?? []).map((run) => run.length);
  let width = 1;
  while (runs.includes(width)) width += 1;
  const fence = "`".repeat(width);
  const pad = text.startsWith("`") || text.endsWith("`") || (text.startsWith(" ") && text.endsWith(" ") && text.trim() !== "") ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** A formula between dollars, or double dollars when it holds one; null when it cannot be read back whole (a space at an edge). */
function mathSpan(text: string): string | null {
  if (text === "" || text !== text.trim()) return null;
  return text.includes("$") ? `$$${text}$$` : `$${text}$`;
}

/** An address as it goes between parentheses: whitespace as percent codes, and a backslash or a parenthesis escaped. */
function destination(url: string): string {
  const encoder = new TextEncoder();
  return [...url]
    .map((c) => (/\s/.test(c) ? [...encoder.encode(c)].map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`).join("") : /[\\()]/.test(c) ? `\\${c}` : c))
    .join("");
}

// ---- the looks

/** A group of pieces as Markdown: the looks opened and closed as they change, as few as will do. */
function marked(pieces: readonly Piece[], inLink: boolean, lineBreak: string): string {
  const steps: Step[] = [];
  const spans: Look[] = [];
  let open: { look: Look; span: number }[] = [];
  let lastFormula: string | null = null;
  for (const piece of hoist(pieces)) {
    const want = piece.kind === "break" ? [] : piece.looks;
    let keep = 0;
    while (keep < open.length && keep < want.length && open[keep]!.look === want[keep]) keep++;
    for (let k = open.length - 1; k >= keep; k--) steps.push({ kind: "close", span: open[k]!.span });
    open = open.slice(0, keep);
    for (let k = keep; k < want.length; k++) {
      spans.push(want[k]!);
      open.push({ look: want[k]!, span: spans.length - 1 });
      steps.push({ kind: "open", span: spans.length - 1 });
    }
    const formula = piece.kind === "math" ? mathSpan(piece.text) : null;
    let text = piece.kind === "break" ? lineBreak : piece.kind === "code" ? codeSpan(piece.text) : (formula ?? escapeText(piece.text, inLink));
    // A digit right after a formula is not read as ending it; an empty underline keeps them apart.
    const before = steps[steps.length - 1];
    if (before?.kind === "text" && before.text === lastFormula && /^\d/.test(text)) text = `${EMPTY}${text}`;
    lastFormula = formula;
    steps.push({ kind: "text", text });
  }
  for (let k = open.length - 1; k >= 0; k--) steps.push({ kind: "close", span: open[k]!.span });
  return writeSteps(steps, spans);
}

const AUTOLINK = /^(https?:\/\/|mailto:)[^\s<>]+$/;

export interface InlineOptions {
  /** What a line break inside the paragraph is written as. Default is a backslash and a new line; give " " to run the lines together. */
  lineBreak?: string;
}

/** The runs of one paragraph as Markdown, without any list marker. */
export function inlineMarkdown(runs: readonly Run[], options: InlineOptions = {}): string {
  const pieces = piecesOf(runs);
  const lineBreak = options.lineBreak ?? "\\\n";
  let out = "";
  for (let i = 0; i < pieces.length; ) {
    const link = pieces[i]!.link;
    let end = i;
    while (end < pieces.length && pieces[end]!.link === link) end++;
    const group = pieces.slice(i, end);
    const only = group.length === 1 ? group[0]! : null;
    if (!link) out += marked(group, false, lineBreak);
    else if (only && only.kind === "text" && only.looks.length === 0 && only.text === link && AUTOLINK.test(link)) out += `<${link}>`;
    else out += `[${marked(group, true, lineBreak)}](${destination(link)})`;
    i = end;
  }
  return out;
}

/** A line's start that would be read as a list, a heading or a quote, kept as words. */
export function guardStart(line: string): string {
  return line
    .replace(/^(\d+)([.)])(?=\s|$)/, "$1\\$2")
    .replace(/^([-+>])(?=\s|$)/, "\\$1")
    .replace(/^(#+)(?=\s|$)/, "\\$1");
}
