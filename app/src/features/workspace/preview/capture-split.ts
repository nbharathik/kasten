// How a quick capture becomes a card, as the core does (capture.rs):
// its first line is the title and its other lines the body, so nothing
// appears twice. A first line that would lose something as a title (a
// to-do's box, a link's address, code, math) stays in the body.

import { readable } from "../names";

const TITLE_CHARS = 80;

/** The title and the body for `markdown`, captured. */
export function splitCapture(markdown: string): { title: string; body: string } {
  const lines = markdown.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim());
  if (at < 0) return { title: "Quick note", body: "" };
  const first = lines[at]!.trim();
  const whole = bodyOf(lines.slice(at));
  const shown = readable(first);
  if (!shown || !plain(first)) return { title: label(shown || "Quick note"), body: whole };
  const rest = bodyOf(lines.slice(at + 1));
  if ([...shown].length <= TITLE_CHARS) return { title: headline(shown), body: rest };
  const end = first === shown ? firstSentence(first) : null;
  if (end !== null) {
    const after = first.slice(end).trim();
    return { title: headline(first.slice(0, end).trim()), body: rest ? `${after}\n${rest}` : `${after}\n` };
  }
  return { title: label(shown), body: whole };
}

/** A title without one closing full stop; "?", "!" and an ellipsis stay. */
function headline(text: string): string {
  return /[^.]\.$/.test(text) ? text.slice(0, -1).trimEnd() : text;
}

function bodyOf(lines: string[]): string {
  const start = lines.findIndex((l) => l.trim());
  const text = start < 0 ? "" : lines.slice(start).join("\n").trimEnd();
  return text ? `${text}\n` : "";
}

function plain(line: string): boolean {
  const block = /^[-*+>|<`~$!]/.test(line) || /^\d+[.)] /.test(line);
  const inline = ["[", "`", "$", "<", "http://", "https://", "|", "^"].some((mark) => line.includes(mark));
  const emphasis = line.startsWith("**") || (line.startsWith("*") && !line.startsWith("* "));
  return (!block || emphasis) && !inline;
}

function firstSentence(line: string): number | null {
  const chars = [...line];
  let offset = 0;
  for (let i = 0; i < chars.length && i < TITLE_CHARS; i++) {
    const c = chars[i]!;
    offset += c.length;
    if (!".!?".includes(c) || chars[i + 1] !== " ") continue;
    const before = line.slice(0, offset - 1);
    const word = before.split(" ").pop() ?? "";
    const short = [...word].length <= 2 || word.includes(".") || ["etc", "vs", "approx"].includes(word);
    if (!short && before.split(/\s+/).filter(Boolean).length >= 3) return offset;
  }
  return null;
}

function label(text: string): string {
  if ([...text].length <= TITLE_CHARS) return text;
  let cut = [...text].slice(0, TITLE_CHARS).join("");
  const space = cut.lastIndexOf(" ");
  if (space > TITLE_CHARS / 2) cut = cut.slice(0, space);
  return `${cut.replace(/[ ,;:-]+$/, "")}…`;
}
