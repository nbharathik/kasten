// Where a highlight card came from: the `source: {file, page, highlight}` key
// the core writes in its frontmatter, in the flow form the core writes or a
// block form other tools may use.

import { readFlow, type Flow } from "../../lib/flow-yaml";
import type { Spot } from "./highlight-request";

const text = (value: Flow | undefined) => (value === null || value === undefined || typeof value === "object" ? "" : String(value));

/** The spot a card's frontmatter names; null when it names none. */
export function sourceOf(frontmatter: string): Spot | null {
  const lines = frontmatter.split(/\r?\n/);
  const at = lines.findIndex((line) => /^source:/.test(line));
  if (at < 0) return null;
  const fields = new Map<string, string>();
  const inline = lines[at]!.slice("source:".length).trim();
  if (inline.startsWith("{") && inline.endsWith("}")) {
    const map = readFlow(inline);
    if (map && typeof map === "object" && !Array.isArray(map)) for (const [key, value] of Object.entries(map)) fields.set(key, text(value));
  } else if (inline === "") {
    for (const line of lines.slice(at + 1)) {
      const m = /^\s+([A-Za-z_]+):\s*(.*)$/.exec(line);
      if (!m) break;
      fields.set(m[1]!, text(readFlow(m[2]!)));
    }
  }
  const source = fields.get("file");
  if (!source || !/^sources\/.+\.pdf$/i.test(source)) return null;
  const page = Number(fields.get("page"));
  const highlight = fields.get("highlight");
  return { source, ...(Number.isInteger(page) && page > 0 ? { page } : {}), ...(highlight ? { highlight } : {}) };
}
