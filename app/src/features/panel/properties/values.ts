// Property values as the panel's editors show and send them. The core checks
// every value against the tag's schema; these only shape what is typed.

/** A value as one line of text. */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(asText).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** A note's property, never a member every object has (a property called
 * "constructor" that the note does not set). */
export const propOf = (props: Readonly<Record<string, unknown>>, key: string): unknown => (Object.hasOwn(props, key) ? props[key] : undefined);

/** A value as a list of strings: a list as it is, one value as one item. */
export function asList(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  const items = Array.isArray(value) ? value : [value];
  return items.filter((v) => v !== null && v !== undefined && v !== "").map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)));
}

/** Whether a value can be edited as text: scalars and lists of scalars, not mappings. */
export function editableAsText(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  return Array.isArray(value) && value.every((v) => v === null || typeof v !== "object");
}

/** Text typed for a property no schema names, in the shape its old value had. */
export function fromText(text: string, previous: unknown): unknown {
  const trimmed = text.trim();
  if (Array.isArray(previous)) return trimmed ? trimmed.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (typeof previous === "number" && trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
  if (typeof previous === "boolean" && (trimmed === "true" || trimmed === "false")) return trimmed === "true";
  return trimmed;
}

export const isChecked = (value: unknown) => value === true || value === "true";

/** The YYYY-MM-DD day a date value starts with, or "". */
export const dayOf = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "");

/** A date property's value moved to `day`, keeping any time after the date. */
export function movedValue(value: unknown, day: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return dayOf(text) ? day + text.slice(10) : day;
}

/** Whether a URL is safe to open from the panel. */
export const openableUrl = (url: string) => /^(https?:\/\/|mailto:)\S+$/i.test(url.trim());

/** A key for a new property: letters, digits, - and _, starting with a letter or _. */
export const validKey = (key: string) => /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(key);
