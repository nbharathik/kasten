// A new row's values: what the view's `is` filters imply, so the new note
// shows up in the view it was made in. Pure, unit tested.

import type { PropDef, TagSchema, ViewFilter } from "../../../../lib/vault/types";
import { BUILT_IN } from "../../model";
import { dayOf } from "../../../panel/properties/values";
import { own } from "./format";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "");

/** The schema's spelling of an option; the text itself when there are no options; null when it is not one. */
function option(def: PropDef, value: unknown): string | null {
  const wanted = text(value);
  if (!wanted) return null;
  if (def.options.length === 0) return wanted;
  return def.options.find((o) => o.toLowerCase() === wanted.toLowerCase()) ?? null;
}

/** One filter's value in the form the property holds, or undefined when none fits. */
function valueFor(def: PropDef, filter: ViewFilter): unknown {
  if (def.type === "checkbox") {
    if (filter.op === "not_empty") return true;
    return filter.op === "is" ? filter.value === true || filter.value === "true" : undefined;
  }
  if (filter.op !== "is") return undefined;
  const raw = text(filter.value);
  if (!raw) return undefined;
  switch (def.type) {
    case "select":
      return option(def, raw) ?? undefined;
    case "multi_select":
      return option(def, raw) ?? undefined;
    case "number":
      return Number.isFinite(Number(raw)) ? Number(raw) : undefined;
    case "date":
      return dayOf(raw) || undefined;
    case "url":
      return raw.includes("://") || raw.startsWith("mailto:") ? raw : undefined;
    default:
      return raw;
  }
}

const LISTS = new Set(["multi_select", "relation"]);

/** Property values for a new note in a view with these filters. */
export function prefill(filters: readonly ViewFilter[] | undefined, schema: TagSchema | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const filter of filters ?? []) {
    if (Object.hasOwn(BUILT_IN, filter.key)) continue;
    const def = schema?.properties.find((p) => p.key === filter.key);
    if (!def) {
      const plain = filter.value;
      const scalar = typeof plain === "number" || typeof plain === "boolean" || (typeof plain === "string" && plain.trim() !== "");
      if (filter.op === "is" && scalar && !Object.hasOwn(out, filter.key)) out[filter.key] = typeof plain === "string" ? plain.trim() : plain;
      continue;
    }
    const value = valueFor(def, filter);
    if (value === undefined) continue;
    if (LISTS.has(def.type)) {
      const list = (own(out, def.key) as string[] | undefined) ?? [];
      if (!list.includes(value as string)) out[def.key] = [...list, value];
    } else if (!Object.hasOwn(out, def.key)) {
      out[def.key] = value;
    }
  }
  return out;
}
