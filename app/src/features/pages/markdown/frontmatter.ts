// Splits a note file into its frontmatter prefix and Markdown body without
// touching a single byte. It must read files exactly as kasten-core's
// `frontmatter::split` does: the page, its history and the preview vault
// all rely on the two agreeing.

export interface SplitNote {
  /** Byte order mark plus the YAML frontmatter block, including its closing
   * fence line and that line's line ending. Empty when there is none. */
  prefix: string;
  /** Everything after the prefix. */
  body: string;
}

const BOM = "﻿";

/**
 * Frontmatter starts at the top of the file (after an optional BOM) with a line
 * that is exactly `---`, and ends at the next line that is exactly `---`
 * (trailing spaces allowed). An unterminated block is not frontmatter, so the
 * whole file is body, as in Obsidian and Jekyll.
 */
export function splitFrontmatter(text: string): SplitNote {
  const bom = text.startsWith(BOM) ? BOM : "";
  const rest = text.slice(bom.length);
  const open = /^---[ \t]*(\r?\n)/.exec(rest);
  if (!open) return { prefix: bom, body: rest };

  const closeFence = /^---[ \t]*(\r?\n|$)/gm;
  closeFence.lastIndex = open[0].length;
  for (let m = closeFence.exec(rest); m; m = closeFence.exec(rest)) {
    // `m` must start a line: the regex is multiline, so it does.
    const end = m.index + m[0].length;
    return { prefix: bom + rest.slice(0, end), body: rest.slice(end) };
  }
  return { prefix: bom, body: rest };
}

/**
 * `body` as written under `prefix`. With no frontmatter above, a body that
 * opens with a `---` rule and has another such line below would read as
 * frontmatter, so its opening rule is written `***`: the same rule.
 */
export function bodyUnder(prefix: string, body: string): string {
  const bare = (prefix.startsWith(BOM) ? prefix.slice(BOM.length) : prefix) === "";
  if (!bare || !body.startsWith("---")) return body;
  return splitFrontmatter(prefix + body).prefix.length > prefix.length ? `***${body.slice(3)}` : body;
}
