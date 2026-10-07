// "Link it" for unlinked mentions:
// the first plain mention of a title in a note's body becomes a [[link]].
// Text that is already a link, code, a URL, math or markup is left alone.

type Range = [start: number, end: number];

const WORD_START = /^[\p{L}\p{N}_]/u;
const WORD_END = /[\p{L}\p{N}_]$/u;

/** Text that must stay as written, after fenced code is taken out. */
const INLINE: RegExp[] = [
  /!?\[\[[^[\]\n]*\]\]/g, // wiki links and embeds
  /!?\[[^\]\n]*\]\([^)\n]*\)/g, // Markdown links and images
  /\[[^\]\n]*\]\[[^\]\n]*\]/g, // reference links
  /<!--[\s\S]*?-->/g, // HTML comments
  /<[^<>\n]+>/g, // HTML tags and <autolinks>
  /\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)[^\s<>]+/gi, // bare URLs
  /\$\$[\s\S]*?\$\$/g, // block math
  /(?<![\\$])\$(?!\s)[^$\n]+?(?<!\s)\$(?!\d)/g, // inline math
];

/** Fenced code blocks, fence lines included. An unclosed fence runs to the end. */
function fences(body: string): Range[] {
  const out: Range[] = [];
  let open: { char: string; size: number; start: number } | null = null;
  let at = 0;
  for (const line of body.split(/(?<=\n)/)) {
    const text = line.replace(/\r?\n$/, "");
    if (open) {
      const close = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text)?.[1];
      if (close && close[0] === open.char && close.length >= open.size) {
        out.push([open.start, at + line.length]);
        open = null;
      }
    } else {
      const mark = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(text);
      // A backtick fence's info string has no backticks; otherwise it is inline code.
      if (mark && !(mark[1]![0] === "`" && mark[2]!.includes("`"))) open = { char: mark[1]![0]!, size: mark[1]!.length, start: at };
    }
    at += line.length;
  }
  if (open) out.push([open.start, body.length]);
  return out;
}

/** Inline code: a run of backticks up to the next run of the same length in the same paragraph. */
function codeSpans(text: string): Range[] {
  const out: Range[] = [];
  const runs = [...text.matchAll(/`+/g)];
  for (let i = 0; i < runs.length; i++) {
    const open = runs[i]!;
    const from = open.index + open[0].length;
    for (let j = i + 1; j < runs.length; j++) {
      const close = runs[j]!;
      if (/\n[ \t]*\r?\n/.test(text.slice(from, close.index))) break;
      if (close[0].length === open[0].length) {
        out.push([open.index, close.index + close[0].length]);
        i = j;
        break;
      }
    }
  }
  return out;
}

/** Everything in `body` a link must not go into. */
export function protectedRanges(body: string): Range[] {
  const fenced = fences(body);
  // Blank out fenced code, keeping offsets and line breaks, before the inline rules run.
  let masked = body;
  for (const [start, end] of fenced) masked = masked.slice(0, start) + masked.slice(start, end).replace(/[^\r\n]/g, " ") + masked.slice(end);
  const out = [...fenced, ...codeSpans(masked)];
  for (const pattern of INLINE) for (const m of masked.matchAll(pattern)) out.push([m.index, m.index + m[0].length]);
  return out;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the line around `start`..`end` has a `|` of its own, as table rows do. */
function inTableRow(body: string, start: number, end: number): boolean {
  const from = body.lastIndexOf("\n", start - 1) + 1;
  const to = body.indexOf("\n", end);
  return (body.slice(from, start) + body.slice(end, to < 0 ? body.length : to)).includes("|");
}

/**
 * `body` with its first plain mention of `title` turned into `[[Title]]`, or
 * `[[Title|text as written]]` when the case differs; null when there is none.
 * With `target` (a path, when the title alone would find another page) the
 * link is `[[target|text as written]]`. Matching ignores case, needs whole
 * words and lets a line break stand for a space, since Markdown paragraphs
 * wrap.
 */
export function linkMention(body: string, title: string, target?: string): string | null {
  const name = title.trim();
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0 || /[[\]|\n]/.test(name)) return null;
  const pattern = new RegExp(words.map(escape).join("(?:[ \\t]+|[ \\t]*\\r?\\n[ \\t]*)"), "giu");
  const blocked = protectedRanges(body);
  for (const match of body.matchAll(pattern)) {
    const start = match.index;
    const end = start + match[0].length;
    // Whole words: a word character at the title's edge may not run on into the text.
    if (WORD_START.test(match[0]) && WORD_END.test(body.slice(Math.max(0, start - 2), start))) continue;
    if (WORD_END.test(match[0]) && WORD_START.test(body.slice(end, end + 2))) continue;
    if (blocked.some(([from, to]) => start < to && end > from)) continue;
    const written = match[0].replace(/\s+/g, " ");
    const named = target ?? name;
    // An alias's `|` would split a table cell, so table rows get the plain name.
    const link = (written === name && !target) || inTableRow(body, start, end) ? `[[${named}]]` : `[[${named}|${written}]]`;
    return body.slice(0, start) + link + body.slice(end);
  }
  return null;
}
