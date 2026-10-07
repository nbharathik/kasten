// The core's property checks (crates/kasten-core/src/tags.rs, `check` and
// `check_props`), so the preview refuses and normalises values the way the
// app on a real vault does.

import type { NoteMeta, TagSchema } from "../../../lib/vault/types";
import { directoryOf, linkParts } from "../links";

type Def = TagSchema["properties"][number];

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(s);

/** A value as text, as the core reads one: trimmed text or a number. */
function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function strings(value: unknown): string[] | null {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    const t = text(item);
    if (t === null) return null;
    out.push(t);
  }
  return out;
}

/** `value` checked against `def`, in the form it is written. */
function check(def: Def, key: string, value: unknown): unknown {
  const fail = (why: string) => new Error(`Property “${key}” (${def.type}) ${why}`);
  const pick = (s: string) => {
    if (def.options.length === 0) return s;
    const found = def.options.find((o) => o.toLowerCase() === s.trim().toLowerCase());
    if (found === undefined) throw fail(`must be one of ${def.options.join(", ")}`);
    return found;
  };
  if (value === null) return null;
  switch (def.type) {
    case "number":
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim() && Number.isFinite(Number(value.trim()))) return Number(value.trim());
      throw fail("must be a number");
    case "checkbox":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "false") return value === "true";
      throw fail("must be a checkbox");
    case "date":
      if (typeof value === "string" && isDate(value.trim())) return value.trim();
      throw fail("must be a date, YYYY-MM-DD");
    case "url":
      if (typeof value === "string" && (value.includes("://") || value.startsWith("mailto:"))) return value;
      throw fail("must be a URL");
    case "select":
      if (typeof value === "string") return pick(value);
      throw fail("must be a select");
    case "multi_select":
    case "relation": {
      const items = strings(value);
      if (!items) throw fail("must be a list of text");
      return def.type === "relation" ? items : items.map(pick);
    }
    case "text":
      if (typeof value === "string") return value;
      if (typeof value === "number") return String(value);
      throw fail("must be a text");
    default:
      throw fail(`must be a ${def.type.replace("_", " ")}`);
  }
}

/** Property changes checked against the schemas of `tags`; keys no schema
 * names may hold text, numbers, booleans or lists of those. */
export function checkProps(schemas: readonly TagSchema[], tags: readonly string[], changes: Record<string, unknown>): Record<string, unknown> {
  const mine = schemas.filter((s) => tags.some((t) => t.toLowerCase() === s.name.toLowerCase()));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    const def = mine.flatMap((s) => s.properties).find((p) => p.key === key);
    if (def) out[key] = check(def, key, value);
    else if (value !== null && typeof value === "object" && !Array.isArray(value)) throw new Error(`Property “${key}” cannot hold a mapping`);
    else if (Array.isArray(value) && value.some((i) => typeof i === "object" && i !== null)) throw new Error(`Property “${key}” can hold a list of text, not nested lists`);
    else out[key] = value;
  }
  return out;
}

/** The relation properties of the schemas of `tags`. */
export function relationKeys(schemas: readonly TagSchema[], tags: readonly string[]): string[] {
  return schemas
    .filter((s) => tags.some((t) => t.toLowerCase() === s.name.toLowerCase()))
    .flatMap((s) => s.properties)
    .filter((p) => p.type === "relation")
    .map((p) => p.key);
}

const isTemplate = (note: NoteMeta) => note.kind === "template" || note.path.toLowerCase().startsWith("templates/");

/**
 * Relation values as the core stores them (`update_props`): an id stays as
 * it is; a note named by path (`.md` optional), by a link or by a title no
 * other note has becomes its id, given one by `idOf` when it has none.
 * Every name is found before any note is given an id; a title several
 * notes share, a template or a note not there is refused.
 */
export function relationIds(items: readonly string[], notes: readonly NoteMeta[], idOf: (path: string) => string): string[] {
  const directory = directoryOf(notes);
  const pathOf = (item: string): string => {
    const trimmed = item.trim();
    const link = /^\[\[(.*)\]\]$/.exec(trimmed);
    const wanted = link ? linkParts(link[1]!).target : trimmed;
    const missing = new Error(`No note called “${item}” to relate to`);
    const at = (path: string) => notes.find((n) => n.path === path);
    const found = (wanted.endsWith(".md") ? at(wanted) : wanted.includes("/") ? at(`${wanted}.md`) : undefined) ?? notes.find((n) => n.id === wanted);
    if (found) {
      if (isTemplate(found)) throw missing;
      return found.path;
    }
    const titled = directory.titled(wanted);
    if (titled.length > 1) throw new Error(`Several notes are called “${wanted}”; name one by path: ${titled.map((n) => n.path).join(", ")}`);
    if (titled.length === 0) throw missing;
    return titled[0]!.path;
  };
  // null: an id, kept as it is.
  const paths = items.map((item) => (notes.some((n) => n.id === item) ? null : pathOf(item)));
  return paths.map((path, i) => (path === null ? items[i]! : idOf(path)));
}
