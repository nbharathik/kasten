// The preview's tag views and properties, as the core's tag_yaml.rs and
// engine/tag_lists.rs do them: one list in a tag's YAML is replaced and
// every other byte of the file stays.

import { writeFlow } from "../../../lib/flow-yaml";

const KINDS = ["text", "number", "select", "multi_select", "date", "checkbox", "url", "relation"];
// As kasten-core's VIEW_KINDS (engine/tag_lists.rs).
const VIEW_KINDS = ["table", "kanban", "list", "calendar", "gallery"];

const isKeyLine = (line: string, key: string) => {
  const plain = line.replace(/^\ufeff/, "");
  return plain.startsWith(key) && /^[ \t]*:/.test(plain.slice(key.length));
};

/** Whether `line` continues a top-level value: indented, or a list item at the left edge. */
const continues = (line: string) => /^[ \t]/.test(line) || line.startsWith("- ") || line.replace(/\r?\n$/, "") === "-";

/** `yaml` with the top-level `key` set to `items`, one flow mapping per
 * line, or `key: []` for none; a missing key goes at the end. */
export function setList(yaml: string, key: string, items: readonly unknown[]): string {
  const eol = yaml.includes("\r\n") ? "\r\n" : "\n";
  const block = items.length === 0 ? `${key}: []${eol}` : `${key}:${eol}${items.map((item) => `  - ${writeFlow(item)}${eol}`).join("")}`;
  const lines = yaml.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const start = lines.findIndex((line) => isKeyLine(line, key));
  if (start < 0) return `${yaml}${yaml === "" || yaml.endsWith("\n") ? "" : eol}${block}`;
  let end = start + 1;
  while (end < lines.length) {
    if (continues(lines[end]!)) {
      end++;
      continue;
    }
    // Blank lines belong to the value only when more of it follows.
    let next = end;
    while (next < lines.length && lines[next]!.trim() === "") next++;
    if (next < lines.length && continues(lines[next]!)) end = next;
    else break;
  }
  return lines.slice(0, start).join("") + block + lines.slice(end).join("");
}

const textOf = (item: Record<string, unknown>, key: string) => (typeof item[key] === "string" ? (item[key] as string).trim() : "");
const isMap = (item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item);

/** Refuses views the app could not show, as the core does. */
export function checkViews(tag: string, views: readonly unknown[]): void {
  const bad = (why: string) => new Error(`Views of “${tag}”: ${why}`);
  const names: string[] = [];
  for (const view of views) {
    if (!isMap(view)) throw bad("each view must be a mapping");
    const name = textOf(view, "name");
    if (!name) throw bad("each view needs a name");
    const kind = typeof view.type === "string" ? view.type : "";
    if (!VIEW_KINDS.includes(kind)) throw bad(`“${name}” has an unknown type “${kind}”`);
    if (names.includes(name.toLowerCase())) throw bad(`two views are called “${name}”`);
    names.push(name.toLowerCase());
  }
}

/** Refuses properties the app could not keep, as the core does. */
export function checkProperties(tag: string, properties: readonly unknown[]): void {
  const bad = (why: string) => new Error(`Properties of “${tag}”: ${why}`);
  const keys: string[] = [];
  for (const prop of properties) {
    if (!isMap(prop)) throw bad("each property must be a mapping");
    const key = textOf(prop, "key");
    if (!key) throw bad("each property needs a key");
    const kind = typeof prop.type === "string" ? prop.type : "text";
    if (!KINDS.includes(kind)) throw bad(`“${key}” has an unknown type “${kind}”`);
    if (prop.options !== undefined && !(Array.isArray(prop.options) && prop.options.every((o) => typeof o === "string" || typeof o === "number"))) {
      throw bad(`the options of “${key}” must be a list of names`);
    }
    if (keys.includes(key)) throw bad(`two properties are called “${key}”`);
    keys.push(key);
  }
}

/** A new tag file's first line. */
export const tagFile = (name: string) => `name: ${writeFlow(name)}\n`;
