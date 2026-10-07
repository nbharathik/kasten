// Text helpers the preview vault shares with kasten-core, ported one to one:
// slugs, the content hash, ids, time stamps, key blocks and wiki links.

import { fenceAfter, linkParts, linkSpans, type Fence } from "../links";

/** UTF-8 bytes of one character. */
const utf8Size = (c: string) => {
  const code = c.codePointAt(0)!;
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
};

/** A file-name-safe slug of at most 80 characters and 120 bytes; `untitled`
 * when nothing usable remains (slug.rs). */
export function slugify(title: string): string {
  let out = "";
  let bytes = 0;
  let chars = 0;
  let dash = false;
  for (const c of title.toLowerCase()) {
    const kept = /[\p{L}\p{N}]/u.test(c);
    if (kept) {
      const joined = dash && out !== "";
      const size = utf8Size(c) + (joined ? 1 : 0);
      if (bytes + size > 120) break;
      out += joined ? `-${c}` : c;
      bytes += size;
      chars += joined ? 2 : 1;
    }
    dash = !kept;
    if (chars >= 80) break;
  }
  return out || "untitled";
}

/** FNV-1a over the UTF-8 bytes, as 16 hex digits (note.rs). */
export function contentHash(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The last id's time and random digits, so ids of one millisecond rise. */
let last = { millis: Number.NaN, digits: [] as number[] };

/** A ULID-shaped id: time, then randomness (id.rs). Monotonic: an id made
 * in the same millisecond as the one before sorts after it. */
export function newId(millis: number): string {
  let time = "";
  let t = millis;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32]! + time;
    t = Math.floor(t / 32);
  }
  if (millis === last.millis) {
    const digits = [...last.digits];
    let at = digits.length - 1;
    for (; at >= 0 && digits[at] === 31; at--) digits[at] = 0;
    if (at >= 0) digits[at]! += 1;
    last = { millis, digits };
  } else last = { millis, digits: [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b % 32) };
  return time + last.digits.map((d) => ALPHABET[d]).join("");
}

/** Newest first: by time, then, within a millisecond, by id. */
export const newestFirst = (a: { time: number; id: string }, b: { time: number; id: string }) => b.time - a.time || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/** The stamps time.rs writes, in UTC. */
export function stamps(millis: number) {
  const iso = new Date(millis).toISOString();
  return {
    rfc3339: `${iso.slice(0, 19)}Z`,
    file: `${iso.slice(0, 10)} ${iso.slice(11, 13)}-${iso.slice(14, 16)}`,
    compact: `${iso.slice(0, 10).replaceAll("-", "")}T${iso.slice(11, 19).replaceAll(":", "")}Z`,
  };
}

/** Top-level keys of a frontmatter prefix with their full text (frontmatter.rs). */
export function keyBlocks(prefix: string): [string, string][] {
  const lines = prefix.replace(/^\ufeff/, "").split(/(?<=\n)/);
  const out: [string, string][] = [];
  for (const line of lines.slice(1, -1)) {
    if (!/^[ \t#\-\r\n]/.test(line) && line.includes(":")) out.push([line.split(":")[0]!.trim(), line]);
    else if (out.length > 0) out[out.length - 1]![1] += line;
  }
  return out;
}

/** What `[[Title]]`, `[[Title#Heading|alias]]` and `![[Title]]` link to,
 * outside code and not escaped, as the core reads links (extract.rs). */
export function wikiLinks(text: string): string[] {
  return linkSpans(text)
    .map(([start, end]) => linkParts(text.slice(start, end)).target)
    .filter(Boolean);
}

/** Whether a file name was made from `title`, or is a fresh `untitled` (rename.rs). */
export function followsTitle(stem: string, title: string): boolean {
  const numbered = (base: string) => stem === base || new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+$`, "u").test(stem);
  return numbered(slugify(title)) || numbered("untitled");
}

/** A body's readable start (for cards) and word count, code fences aside
 * (extract.rs). A first line that only repeats `title` stays out. */
export function bodyFacts(body: string, title?: string | null): { excerpt: string; words: number } {
  let repeat = title?.trim() || null;
  let fence: Fence | null = null;
  let math = false;
  let excerpt = "";
  let words = 0;
  for (const line of body.split(/\r?\n/)) {
    words += (line.replace(/<[^>]*>/g, " ").match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) ?? []).length;
    const [after, marker] = fenceAfter(fence, line);
    fence = after;
    if (marker) continue;
    if (fence !== null) continue;
    // Equations and tables read badly as a line of text.
    const trimmed = line.trim();
    const mathLine = math || trimmed.startsWith("$$");
    if (trimmed === "$$") math = !math;
    else if (trimmed.startsWith("$$") && !(trimmed.length > 2 && trimmed.endsWith("$$"))) math = true;
    else if (math && trimmed.endsWith("$$")) math = false;
    if (mathLine || trimmed.startsWith("|") || excerpt.length >= 220 || !trimmed) continue;
    const text = readableLine(line.slice(0, 900));
    if (text && repeat !== null) {
      const same = text === repeat;
      repeat = null;
      if (same) continue;
    }
    if (text) excerpt += (excerpt ? " " : "") + text;
  }
  if (excerpt.length > 220) excerpt = `${excerpt.slice(0, 220).replace(/\s+\S*$/, "")}…`;
  return { excerpt, words };
}

/** One Markdown line as plain text (extract.rs `readable`). */
export function readableLine(line: string): string {
  const text = line
    .trim()
    .replace(/^(?:>\s*)+(?:\[![a-z]+\]\s*)?/i, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "");
  // Code spans keep their text as written.
  let out = "";
  let last = 0;
  for (const match of text.matchAll(/(`+)(.+?)(?<!`)\1(?!`)/g)) {
    out += withMath(text.slice(last, match.index)) + match[2]!.trim();
    last = match.index + match[0].length;
  }
  return (out + withMath(text.slice(last))).replace(/\s+/g, " ").trim();
}

/** An ASCII punctuation mark, the only thing a backslash escapes. */
const PUNCTUATION = /[!-/:-@[-`{-~]/;

/** Inline math starting at `at`: its TeX and where it ends. The editor's
 * rule (math-remark.ts), as readable.rs reads it: no space just inside
 * single dollars, and no digit right after them. */
function mathAt(text: string, at: number): { tex: string; end: number } | null {
  const dollars = text.startsWith("$$", at) ? 2 : 1;
  const close = text.indexOf("$".repeat(dollars), at + dollars);
  if (close < 0 || close - at > 300) return null;
  const tex = text.slice(at + dollars, close);
  const end = close + dollars;
  if (!tex.trim() || (dollars === 1 && (/^\s|\s$/.test(tex) || /^\d/.test(text.slice(end))))) return null;
  return { tex: tex.trim(), end };
}

/** Plain text with inline math read as its TeX, which stands as written. */
function withMath(text: string): string {
  let out = "";
  let last = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && PUNCTUATION.test(text[i + 1] ?? "")) i++;
    else if (text[i] === "$") {
      const math = mathAt(text, i);
      if (!math) continue;
      out += plainText(text.slice(last, i)) + math.tex;
      last = math.end;
      i = math.end - 1;
    }
  }
  return out + plainText(text.slice(last));
}

function plainText(text: string): string {
  return text
    .replace(/(?<!\\)!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, t: string, a?: string) => (a ?? t).trim())
    .replace(/(?<!\\)\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/\*\*|__|~~|`/g, "")
    // A single * or _ between a word and a space or edge marks emphasis,
    // unless it is escaped.
    .replace(/(?<![\p{L}\p{N}\\])[*_](?=[\p{L}\p{N}])|(?<=[\p{L}\p{N}])[*_](?![\p{L}\p{N}])/gu, "")
    .replace(/\\([!-/:-@[-`{-~])/g, "$1");
}
