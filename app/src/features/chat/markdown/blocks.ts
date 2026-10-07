// The blocks of an answer's Markdown: paragraphs, headings, lists (nested,
// with to-dos), fenced code, quotes, rules and GFM tables. A small reader
// for text a model writes, not a full CommonMark parser: it is lenient with
// text still streaming (an open fence runs to the end) and never reads
// HTML, which stays text.

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: number; text: string }
  | { type: "code"; lang: string; text: string }
  | { type: "list"; ordered: boolean; start: number; items: Item[] }
  | { type: "quote"; blocks: Block[] }
  | { type: "rule" }
  | { type: "table"; align: Align[]; head: string[]; rows: string[][] };

export interface Item {
  /** A to-do's box; null for a plain item. */
  checked: boolean | null;
  blocks: Block[];
}

/** A top-level block with the source it came from, so a view can tell
 * which blocks changed while an answer streams. */
export type SourcedBlock = Block & { src: string };

const FENCE = /^( {0,3})(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const TABLE_RULE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

const blank = (line: string | undefined) => line === undefined || line.trim() === "";
const indentOf = (line: string) => line.length - line.trimStart().length;

/** Cells of a table row; `\|` is a pipe inside a cell. */
function cells(line: string): string[] {
  const row = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  return left && right ? "center" : right ? "right" : left ? "left" : null;
}

/** Whether a table starts at line `i`: a row of cells, then a rule row with as many. */
function tableStarts(lines: string[], i: number): boolean {
  const head = lines[i];
  const rule = lines[i + 1];
  return Boolean(head?.includes("|") && rule && TABLE_RULE.test(rule) && rule.includes("-") && cells(head).length === cells(rule).length);
}

/** Whether `line` starts a block, which ends the paragraph before it. */
function interrupts(lines: string[], i: number): boolean {
  const line = lines[i]!;
  if (FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || tableStarts(lines, i)) return true;
  // As in CommonMark, a numbered list breaks into a paragraph only from 1:
  // "in\n1984. Orwell" stays one paragraph.
  const item = ITEM.exec(line);
  return Boolean(item?.[4]?.trim() && (!/\d/.test(item[2]!) || Number.parseInt(item[2]!, 10) === 1));
}

/** How deep quotes and lists nest before their markers read as text, so a
 * line of thousands of "- " or ">" cannot run the parser out of stack. */
export const MAX_DEPTH = 32;

export function parseBlocks(markdown: string): SourcedBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").replace(/^\t+/gm, (tabs) => "    ".repeat(tabs.length)).split("\n");
  return read(lines, 0, true) as SourcedBlock[];
}

function read(lines: string[], depth: number, sourced = false): Block[] {
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (blank(lines[i])) {
      i++;
      continue;
    }
    const start = i;
    const [block, next] = blockAt(lines, i, depth);
    i = next;
    out.push(sourced ? ({ ...block, src: lines.slice(start, next).join("\n") } as SourcedBlock) : block);
  }
  return out;
}

function blockAt(lines: string[], i: number, depth: number): [Block, number] {
  const line = lines[i]!;
  const fence = FENCE.exec(line);
  if (fence) {
    const [, indent, mark, lang] = fence;
    const body: string[] = [];
    let j = i + 1;
    const closes = new RegExp(`^ {0,3}${mark![0] === "`" ? "`" : "~"}{${mark!.length},}[ \\t]*$`);
    for (; j < lines.length && !closes.test(lines[j]!); j++) body.push(lines[j]!.slice(Math.min(indent!.length, indentOf(lines[j]!))));
    return [{ type: "code", lang: lang ?? "", text: body.join("\n") }, Math.min(j + 1, lines.length)];
  }
  const heading = HEADING.exec(line);
  if (heading) return [{ type: "heading", level: heading[1]!.length, text: (heading[2] ?? "").trim() }, i + 1];
  if (RULE.test(line)) return [{ type: "rule" }, i + 1];
  const nests = depth < MAX_DEPTH;
  if (nests && QUOTE.test(line)) {
    const inner: string[] = [];
    let j = i;
    for (; j < lines.length && !blank(lines[j]); j++) {
      const quoted = QUOTE.exec(lines[j]!);
      if (!quoted && interrupts(lines, j)) break;
      inner.push(quoted ? quoted[1]! : lines[j]!.trim());
    }
    return [{ type: "quote", blocks: read(inner, depth + 1) }, j];
  }
  if (nests && ITEM.test(line)) return listAt(lines, i, depth);
  if (tableStarts(lines, i)) {
    const head = cells(line);
    const align = cells(lines[i + 1]!).map(alignOf);
    let j = i + 2;
    const rows: string[][] = [];
    for (; j < lines.length && !blank(lines[j]) && lines[j]!.includes("|"); j++) {
      const row = cells(lines[j]!);
      rows.push(head.map((_, k) => row[k] ?? ""));
    }
    return [{ type: "table", align, head, rows }, j];
  }
  const text = [line.trim()];
  let j = i + 1;
  for (; j < lines.length && !blank(lines[j]) && !interrupts(lines, j); j++) text.push(lines[j]!.trim());
  return [{ type: "paragraph", text: text.join("\n") }, j];
}

/** A list from line `i`: its items, each holding the lines indented under
 * it, read again as blocks (so lists nest and items can hold code). */
function listAt(lines: string[], i: number, depth: number): [Block, number] {
  const first = ITEM.exec(lines[i]!)!;
  const ordered = /\d/.test(first[2]!);
  const items: Item[] = [];
  let j = i;
  for (;;) {
    const item = ITEM.exec(lines[j] ?? "");
    if (!item || /\d/.test(item[2]!) !== ordered || RULE.test(lines[j]!)) break;
    const gap = item[3]?.length ?? 1;
    const content = item[1]!.length + item[2]!.length + (gap > 4 ? 1 : gap);
    const body = [gap > 4 ? `${" ".repeat(gap - 1)}${item[4] ?? ""}` : (item[4] ?? "")];
    j++;
    while (j < lines.length) {
      const line = lines[j]!;
      if (blank(line)) {
        let k = j + 1;
        while (k < lines.length && blank(lines[k])) k++;
        if (k < lines.length && indentOf(lines[k]!) >= content) {
          for (; j < k; j++) body.push("");
          continue;
        }
        break;
      }
      if (indentOf(line) >= content) body.push(line.slice(content));
      else if (ITEM.test(line) || interrupts(lines, j)) break;
      else body.push(line.trim());
      j++;
    }
    const task = /^\[([ xX])\][ \t]+/.exec(body[0]!);
    if (task) body[0] = body[0]!.slice(task[0].length);
    items.push({ checked: task ? task[1] !== " " : null, blocks: read(body, depth + 1) });
    // A blank line between items keeps the list going.
    let k = j;
    while (k < lines.length && blank(lines[k])) k++;
    const next = ITEM.exec(lines[k] ?? "");
    if (!next || /\d/.test(next[2]!) !== ordered) break;
    j = k;
  }
  return [{ type: "list", ordered, start: ordered ? Number.parseInt(first[2]!, 10) : 1, items }, j];
}
