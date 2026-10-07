// What the preview's highlights write, after kasten-core's sources module
// and engine/sources.rs: sidecar names, the checks on a new highlight, and
// a highlight card's title and body.

import { HIGHLIGHT_COLORS, type Highlight, type NewHighlight } from "../../../lib/vault/source-types";
import { slugify } from "./vault-text";

export const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
const MAX_TEXT = 20_000;
const MAX_RECTS = 1_000;

/** `sources/x.pdf` has `sources/x.highlights.json`. */
export function sidecarOf(source: string): string {
  if (!/^sources\/.+\.pdf$/i.test(source)) throw new Error(`Not a source in this vault: ${source}`);
  return `${source.slice(0, -4)}.highlights.json`;
}

/** The file name's stem. */
export const stemOf = (path: string) => (path.split("/").pop() ?? path).replace(/\.[^.]*$/, "");

/** The name a PDF is kept under, and the title it keeps. */
export function sourceName(name: string): { slug: string; title: string } {
  const base = (name.split(/[\\/]/).pop() ?? name).trim();
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : "";
  if (!slugify(stem)) throw new Error(`Cannot import “${base}”: a source is a PDF with a name, such as paper.pdf`);
  if (base.slice(dot + 1).toLowerCase() !== "pdf") throw new Error(`Cannot import “${base}”: only PDFs can be sources`);
  return { slug: slugify(stem), title: stem.trim() };
}

/** Whether `bytes` start as a PDF does: the header may sit anywhere in the first kilobyte. */
export function isPdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  return head.includes("%PDF-");
}

const oneLine = (text: string) => text.split(/\s+/).filter(Boolean).join(" ");

/** On one line; over `max` characters, the whole words that fit in `cut` and an ellipsis. */
export function shortened(text: string, max = 60, cut = 50): string {
  const line = oneLine(text);
  if ([...line].length <= max) return line;
  let head = "";
  for (const word of line.split(" ")) {
    if ([...head].length + (head ? 1 : 0) + [...word].length > cut) break;
    head = head ? `${head} ${word}` : word;
  }
  if (!head) head = [...line].slice(0, cut).join("");
  return `${head.replace(/[,;:\-–—]+$/, "")}…`;
}

export function checkNew(h: NewHighlight): void {
  if (!Number.isInteger(h.page) || h.page < 1) throw new Error("Pages count from 1");
  if (h.rects.length === 0 || h.rects.length > MAX_RECTS) throw new Error(`A highlight covers 1 to ${MAX_RECTS} rectangles`);
  if (h.rects.some((r) => r.length !== 4 || r.some((n) => !Number.isFinite(n)))) throw new Error("A highlight's rectangles need numbers");
  if (!h.text.trim()) throw new Error("A highlight needs the text it marks");
  if (h.text.length > MAX_TEXT || (h.comment ?? "").length > MAX_TEXT) throw new Error(`A highlight's text and comment are at most ${MAX_TEXT} characters`);
  checkColor(h.color);
}

export function checkColor(color: string): void {
  if (!(HIGHLIGHT_COLORS as readonly string[]).includes(color)) throw new Error(`A highlight is ${HIGHLIGHT_COLORS.join(", ")}, not ${color}`);
}

/** A highlight card's title: the quote, shortened, without link-breaking characters. */
export const cardTitle = (text: string) => shortened(text.replace(/[[\]|#]/g, " ")) || "Highlight";

/** The quote on one line, escaped so it stays plain text in a blockquote. */
function quoted(text: string): string {
  const line = oneLine(text).replaceAll("[[", "\\[[");
  return /^([#>\-+*=]|\d{1,9}[.)])/.test(line) ? `\\${line}` : line;
}

/** A vault path as a Markdown link's target: characters a link or a URL
 * reads specially (spaces, `#`, `%`, brackets…) percent-encoded, letters in
 * any script kept as they are. */
export function linkPath(path: string): string {
  return [...path].map((c) => (/^[A-Za-z0-9/\-._~!$&'*+,;=:@]$/.test(c) || c.codePointAt(0)! > 0x7f ? c : `%${c.codePointAt(0)!.toString(16).toUpperCase().padStart(2, "0")}`)).join("");
}

/** The card's body: the quote, the comment and a link back to the spot. */
export function cardBody(h: Highlight, title: string, source: string, card: string): string {
  const parts = [`> ${quoted(h.text)}`];
  const comment = h.comment?.trim();
  if (comment) parts.push(comment);
  const up = "../".repeat(card.split("/").length - 1);
  const target = `${up}${linkPath(source)}`;
  const label = title.replaceAll("[", "\\[").replaceAll("]", "\\]");
  parts.push(`[${label}, page ${h.page}](${target}#page=${h.page}&highlight=${h.id})`);
  return `${parts.join("\n\n")}\n`;
}
