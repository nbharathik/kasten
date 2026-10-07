// Pasted content, read down to what slide text keeps: paragraphs, list items,
// and bold, italic, underline, strike and links. Fonts, colours and sizes of
// wherever it came from are left behind.

import type { ListKind } from "@kasten-slides/wasm";

import { safeLink } from "./links.ts";
import { MAX_LEVEL } from "./lists.ts";

/** A stretch of pasted words with the few looks that are kept. */
export interface PastedRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  link: string | null;
  /** A line break made by `<br>`, which is dropped at the end of a paragraph. */
  lineBreak?: boolean;
}

export interface PastedParagraph {
  list: ListKind | null;
  level: number;
  runs: PastedRun[];
}

const plain = (text: string): PastedRun => ({ text, bold: false, italic: false, underline: false, strike: false, link: null });

/** Plain text: a paragraph for each line. */
export function parseText(text: string): PastedParagraph[] {
  return text.split(/\r\n|\r|\n/).map((line) => ({ list: null, level: 0, runs: line === "" ? [] : [plain(line)] }));
}

const IGNORED = new Set(["script", "style", "head", "title", "meta", "link", "template", "noscript", "iframe", "object", "embed", "svg", "canvas", "audio", "video", "img", "picture", "input", "select", "textarea"]);

const BLOCKS = new Set(["p", "div", "section", "article", "header", "footer", "aside", "nav", "main", "address", "figure", "figcaption", "blockquote", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "hr", "fieldset", "form", "details", "summary"]);

interface Look {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  link: string | null;
  /** Spaces and line ends are kept as they are. */
  pre: boolean;
}

/** The declarations of an element's `style` attribute, names in lower case. */
function declarations(element: Element): Map<string, string> {
  const found = new Map<string, string>();
  for (const part of (element.getAttribute("style") ?? "").split(";")) {
    const colon = part.indexOf(":");
    if (colon > 0) found.set(part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim().toLowerCase());
  }
  return found;
}

/** The look inside an element: the look outside it, changed by its tag and its style. */
function lookOf(element: Element, outside: Look): Look {
  const tag = element.tagName.toLowerCase();
  const look = { ...outside };
  if (tag === "b" || tag === "strong") look.bold = true;
  if (tag === "i" || tag === "em" || tag === "cite" || tag === "dfn" || tag === "var") look.italic = true;
  if (tag === "u" || tag === "ins") look.underline = true;
  if (tag === "s" || tag === "strike" || tag === "del") look.strike = true;
  if (tag === "pre") look.pre = true;
  if (tag === "a") look.link = safeLink(element.getAttribute("href")) ?? look.link;
  // A style wins over its tag: Google Docs wraps what it copies in a `b` whose weight is normal.
  const style = declarations(element);
  const weight = style.get("font-weight");
  if (weight) look.bold = weight === "bold" || weight === "bolder" || Number(weight) >= 600;
  const slant = style.get("font-style");
  if (slant) look.italic = slant === "italic" || slant.startsWith("oblique");
  const lines = `${style.get("text-decoration-line") ?? ""} ${style.get("text-decoration") ?? ""}`;
  if (lines.includes("underline")) look.underline = true;
  if (lines.includes("line-through")) look.strike = true;
  if ((style.get("white-space") ?? "").startsWith("pre")) look.pre = true;
  return look;
}

/** Collects paragraphs as the page is walked. */
class Collector {
  readonly paragraphs: PastedParagraph[] = [];
  private current: PastedParagraph | null = null;
  private item: { list: ListKind; level: number } | null = null;

  /** The next paragraph collected is a list item. */
  startItem(list: ListKind, level: number): void {
    this.end();
    this.item = { list, level: Math.min(MAX_LEVEL, Math.max(0, level)) };
  }

  endItem(): void {
    this.end();
    this.item = null;
  }

  add(text: string, look: Look): void {
    const shown = look.pre ? text : this.collapse(text).replace(/\u00a0/g, " ");
    if (shown === "") return;
    this.open().runs.push({ text: shown, bold: look.bold, italic: look.italic, underline: look.underline, strike: look.strike, link: look.link });
  }

  lineBreak(look: Look): void {
    this.open().runs.push({ text: "\n", bold: look.bold, italic: look.italic, underline: look.underline, strike: look.strike, link: look.link, lineBreak: true });
  }

  /** Makes sure there is a paragraph to end, so that a line with nothing on it is an empty paragraph. */
  blank(): void {
    this.open();
  }

  /** Runs of white space are one space, and there is none at the start of a paragraph. */
  private collapse(text: string): string {
    const spaced = text.replace(/[ \t\r\n\f]+/g, " ");
    const last = this.current?.runs[this.current.runs.length - 1];
    const atStart = last === undefined || last.lineBreak === true || last.text.endsWith(" ");
    return atStart ? spaced.replace(/^ /, "") : spaced;
  }

  private open(): PastedParagraph {
    if (!this.current) {
      this.current = { list: this.item?.list ?? null, level: this.item?.level ?? 0, runs: [] };
      this.item = null;
    }
    return this.current;
  }

  /** Ends the paragraph being collected. A last line break and last spaces are not kept. */
  end(): void {
    const paragraph = this.current;
    this.current = null;
    if (!paragraph) return;
    const runs = paragraph.runs;
    if (runs[runs.length - 1]?.lineBreak) runs.pop();
    const last = runs[runs.length - 1];
    if (last) {
      last.text = last.text.replace(/ +$/, "");
      if (last.text === "") runs.pop();
    }
    this.paragraphs.push(paragraph);
  }
}

/** Text in preformatted content: each line is a paragraph, and a line with nothing on it an empty one. */
function addPreformatted(text: string, look: Look, out: Collector): void {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((line, index) => {
    if (index > 0) out.end();
    if (line !== "") out.add(line, look);
    else if (index < lines.length - 1 || lines.length === 1) out.blank();
  });
}

function walk(node: Node, look: Look, lists: readonly ListKind[], out: Collector): void {
  if (node.nodeType === 3) {
    const text = node.nodeValue ?? "";
    if (look.pre) addPreformatted(text, look, out);
    else out.add(text, look);
    return;
  }
  if (node.nodeType !== 1) return;
  const element = node as Element;
  const tag = element.tagName.toLowerCase();
  if (IGNORED.has(tag)) return;
  if (tag === "br") {
    out.lineBreak(look);
    return;
  }
  const inside = lookOf(element, look);
  const inList = tag === "ul" || tag === "ol" ? [...lists, tag === "ol" ? ("number" as const) : ("bullet" as const)] : lists;
  if (tag === "li") out.startItem(lists[lists.length - 1] ?? "bullet", Math.max(0, lists.length - 1));
  else if (BLOCKS.has(tag)) out.end();
  else if ((tag === "td" || tag === "th") && element.previousElementSibling) out.add("\t", { ...inside, pre: true });
  for (const child of Array.from(element.childNodes)) walk(child, inside, inList, out);
  if (tag === "li") out.endItem();
  else if (BLOCKS.has(tag)) out.end();
}

/** The paragraphs in a piece of HTML. */
export function parseHtml(html: string): PastedParagraph[] {
  const page = new DOMParser().parseFromString(html, "text/html");
  const out = new Collector();
  walk(page.body, { bold: false, italic: false, underline: false, strike: false, link: null, pre: false }, [], out);
  out.end();
  return out.paragraphs;
}

/** Whether any paragraph has words. */
export const hasWords = (paragraphs: readonly PastedParagraph[]): boolean => paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text.trim() !== ""));
