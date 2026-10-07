// The page header's fields (title, icon and cover) in the note's YAML
// frontmatter. Writing touches only the changed key's line, so unknown keys,
// comments and spacing survive byte for byte. In the app
// the Rust core owns every write to the vault; these functions
// read headers and power the browser preview's vault.

export interface PageMeta {
  title: string;
  icon: string;
  cover: string;
}
export type MetaKey = keyof PageMeta;

const BOM = "﻿";
const FENCE = /^---[ \t]*(\r?\n)?$/;

/** The text of a scalar value and any trailing comment, from after `key:`. */
function parseValue(raw: string): { value: string; comment: string } {
  const text = raw.replace(/^[ \t]+/, "");
  if (text.startsWith('"')) {
    let value = "";
    let i = 1;
    for (; i < text.length && text[i] !== '"'; i++) {
      if (text[i] === "\\" && i + 1 < text.length) {
        const escaped = text[++i]!;
        if (escaped === "u") {
          value += String.fromCharCode(Number.parseInt(text.slice(i + 1, i + 5), 16));
          i += 4;
        } else value += ({ n: "\n", t: "\t", r: "\r", "0": "\0" } as Record<string, string>)[escaped] ?? escaped;
      } else value += text[i];
    }
    return { value, comment: text.slice(i + 1).match(/^\s+#.*$/)?.[0] ?? "" };
  }
  if (text.startsWith("'")) {
    let value = "";
    let i = 1;
    for (; i < text.length; i++) {
      if (text[i] !== "'") value += text[i];
      else if (text[i + 1] === "'") value += text[++i];
      else break;
    }
    return { value, comment: text.slice(i + 1).match(/^\s+#.*$/)?.[0] ?? "" };
  }
  const comment = text.match(/\s+#.*$/)?.[0] ?? "";
  const value = text.slice(0, text.length - comment.length).trimEnd();
  // A block scalar's text is on the following lines; the header shows none of it.
  return { value: /^[|>]/.test(value) ? "" : value, comment };
}

const RESERVED = /^(?:true|false|yes|no|y|n|on|off|null|~|[-+]?(?:\d[\d_]*\.?\d*(?:e[-+]?\d+)?|\.\d+|\.inf|\.nan|0[xob][\da-f_]+))$/i;

/** What YAML does not allow as it is in a scalar: controls, DEL, C1 controls
 * but NEL, a byte order mark, U+FFFE and U+FFFF (frontmatter/keys.rs). */
  // eslint-disable-next-line no-control-regex -- Strip or reject literal control characters in untrusted text.
const UNPRINTABLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u0084\u0086-\u009f\ufeff\ufffe\uffff]/;

/** Double-quoted, JSON rules, which YAML reads; with every character it
 * does not allow as it is escaped. */
const quote = (value: string) =>
  JSON.stringify(value).replace(/[\u007f-\u0084\u0086-\u009f\ufeff\ufffe\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

/** `value` as a YAML scalar: plain when YAML reads it back as the same string, double-quoted otherwise. */
export function yamlScalar(value: string): string {
  return yamlScalarOf(value);
}

function yamlScalarOf(value: string): string {
  const plain =
    value !== "" &&
    value === value.trim() &&
    !/^[-?:,[\]{}#&*!|>'"%@`]/.test(value) &&
    !/: |\s#|[\n\r\t]|:$/.test(value) &&
    !UNPRINTABLE.test(value) &&
    !RESERVED.test(value);
  return plain ? value : quote(value);
}

/** Lines of the frontmatter block, each with its line ending. */
function lines(prefix: string): string[] {
  return prefix.slice(prefix.startsWith(BOM) ? 1 : 0).split(/(?<=\n)/);
}

const escapeKey = (key: string) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const keyLine = (key: string) => new RegExp(`^${escapeKey(key)}[ \\t]*:(.*?)\\r?\\n?$`);

export function readPageMeta(prefix: string): PageMeta {
  const meta: PageMeta = { title: "", icon: "", cover: "" };
  const all = lines(prefix);
  for (const line of all.slice(1, -1)) {
    for (const key of Object.keys(meta) as MetaKey[]) {
      const match = keyLine(key).exec(line);
      if (match) meta[key] = parseValue(match[1]!).value;
    }
  }
  return meta;
}

/** The top-level scalar keys of a prefix, plus `tags` as a list. Nested and
 * block values read as empty. */
export function readKeys(prefix: string): { values: Record<string, string>; tags: string[] } {
  const values: Record<string, string> = {};
  let tags: string[] = [];
  const all = lines(prefix);
  for (let i = 1; i < all.length - 1; i++) {
    const match = /^([A-Za-z_][\w-]*)[ \t]*:(.*?)\r?\n?$/.exec(all[i]!);
    if (!match) continue;
    const key = match[1]!;
    const raw = match[2]!.trim();
    if (key === "tags") {
      if (raw.startsWith("[")) tags = raw.slice(1, raw.lastIndexOf("]")).split(",").map((t) => parseValue(t).value.trim()).filter(Boolean);
      else if (raw) tags = [parseValue(raw).value];
      else for (let j = i + 1; j < all.length - 1 && /^\s+-\s/.test(all[j]!); j++) tags.push(parseValue(all[j]!.replace(/^\s+-\s/, "")).value.trim());
      continue;
    }
    values[key] = parseValue(match[2]!).value;
  }
  return { values, tags };
}

/** Sets or, with `null`, removes one header key; `eol` is used only for new frontmatter. */
export function setPageMeta(prefix: string, key: MetaKey, value: string | null, eol: "\n" | "\r\n" = "\n"): string {
  return setFrontmatterKey(prefix, key, value, eol);
}

/** A YAML flow list of scalars, `[a, "b: c"]`. */
export const yamlList = (items: string[]) => `[${items.map(yamlScalar).join(", ")}]`;

/** Sets or removes any top-level key, touching only its lines. */
export function setFrontmatterKey(prefix: string, key: string, value: string | null, eol: "\n" | "\r\n" = "\n", raw = false): string {
  const yamlScalar = raw ? (v: string) => v : yamlScalarOf;
  const bom = prefix.startsWith(BOM) ? BOM : "";
  if (prefix.length === bom.length) {
    return value === null ? prefix : `${bom}---${eol}${key}: ${yamlScalar(value)}${eol}---${eol}`;
  }
  const all = lines(prefix);
  const close = all.length - 1;
  if (close < 1 || !FENCE.test(all[close]!)) throw new Error("not a frontmatter block");
  const lineEol = all[0]!.endsWith("\r\n") ? "\r\n" : "\n";

  let at = -1;
  let end = -1;
  let comment = "";
  for (let i = 1; i < close && at < 0; i++) {
    const match = keyLine(key).exec(all[i]!);
    if (!match) continue;
    at = i;
    end = i + 1;
    // Indented lines below belong to the value (a block scalar or a folded line).
    while (end < close && /^[ \t]/.test(all[end]!)) end++;
    if (end === i + 1) comment = parseValue(match[1]!).comment;
  }
  const replacement = value === null ? [] : [`${key}: ${yamlScalar(value)}${comment}${lineEol}`];
  if (at >= 0) all.splice(at, end - at, ...replacement);
  else all.splice(close, 0, ...replacement);
  return bom + all.join("");
}
