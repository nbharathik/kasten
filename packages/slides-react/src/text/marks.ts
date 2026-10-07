// A run's formatting as a stack of wrapping elements. ProseMirror draws each
// mark as an element around the text, nested in the order the schema lists
// the marks, and the read-only drawing nests the same elements in the same
// order, so a word looks and measures the same before and while it is edited.
//
// The order matters where two marks set the same thing. Outermost first:
//   size, code, font   a run's own `font` sits inside `code`, so it wins over the code font
//   bold, italic, math
//   color, link        the link's colour sits inside the run's own, so a link is always the theme's link colour
//   underline, strike  inside the colour, so a line is drawn in the colour of its text
//   field, extra       nothing to see

import type { Run, Theme } from "@kasten-slides/wasm";

import { colorOf, fontStack, hexOf } from "../theme/index.ts";
import { type Css, ptToPx, px } from "./css.ts";
import { codeBackground, isSize } from "./text-style.ts";

export const MARK_ORDER = ["size", "code", "font", "bold", "italic", "math", "color", "link", "underline", "strike", "field", "extra"] as const;

export type MarkName = (typeof MARK_ORDER)[number];

/** A mark with the value it carries, if it carries one. */
export type MarkInput =
  | { name: "size"; value: number }
  | { name: "font" | "color" | "link" | "field" | "extra"; value: string }
  | { name: "code" | "bold" | "italic" | "math" | "underline" | "strike" };

/** The attribute a valued mark keeps its value in. */
export const MARK_ATTR = { size: "value", font: "value", color: "value", link: "href", field: "name", extra: "json" } as const;

/** The fields of a run the format defines; anything else in a run is kept as it is. */
export const RUN_KEYS: ReadonlySet<string> = new Set(["t", "b", "i", "u", "s", "color", "size", "font", "link", "code", "math", "field"]);

const text = (value: unknown): value is string => typeof value === "string" && value !== "";

/** The fields of a run that the format does not define, or null when it has none. */
export function runExtra(run: Run): Record<string, unknown> | null {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(run)) if (!RUN_KEYS.has(key)) extra[key] = value;
  return Object.keys(extra).length > 0 ? extra : null;
}

/** The marks a run stands for, in schema order. */
export function markInputsOf(run: Run): MarkInput[] {
  const out: MarkInput[] = [];
  if (isSize(run.size)) out.push({ name: "size", value: run.size });
  if (run.code) out.push({ name: "code" });
  if (text(run.font)) out.push({ name: "font", value: run.font });
  if (run.b) out.push({ name: "bold" });
  if (run.i) out.push({ name: "italic" });
  if (run.math) out.push({ name: "math" });
  if (text(run.color)) out.push({ name: "color", value: run.color });
  if (text(run.link)) out.push({ name: "link", value: run.link });
  if (run.u) out.push({ name: "underline" });
  if (run.s) out.push({ name: "strike" });
  if (text(run.field)) out.push({ name: "field", value: run.field });
  const extra = runExtra(run);
  if (extra) out.push({ name: "extra", value: JSON.stringify(extra) });
  return out;
}

/** One element around a run's text. */
export interface Wrap {
  tag: "span" | "a";
  className?: string;
  style: Css;
  attrs: Record<string, string>;
}

/**
 * The element a mark is drawn as. A link is an `a` with its address in
 * `data-href` and no `href`, so that nothing navigates from a slide by itself;
 * whoever presents the slide follows it.
 */
export function wrapOf(theme: Theme, input: MarkInput): Wrap {
  const span = (style: Css, className?: string, attrs: Record<string, string> = {}): Wrap => ({ tag: "span", ...(className ? { className } : {}), style, attrs });
  switch (input.name) {
    case "size":
      return span({ fontSize: px(ptToPx(input.value)) });
    case "code":
      return span({ fontFamily: fontStack(theme, "code"), background: codeBackground(theme), borderRadius: "3px" }, "ks-text-code");
    case "font":
      return span({ fontFamily: fontStack(theme, input.value) });
    case "bold":
      return span({ fontWeight: 700 });
    case "italic":
      return span({ fontStyle: "italic" });
    case "math":
      return span({ fontStyle: "italic" }, "ks-text-math");
    case "color": {
      const hex = hexOf(theme, input.value);
      return span(hex ? { color: hex } : {});
    }
    case "link":
      return { tag: "a", className: "ks-text-link", style: { color: colorOf(theme, "accent1"), textDecoration: "underline" }, attrs: { "data-href": input.value } };
    case "underline":
      return span({ textDecoration: "underline" });
    case "strike":
      return span({ textDecoration: "line-through" });
    case "field":
      return span({}, "ks-text-field", { "data-field": input.value });
    case "extra":
      return span({});
  }
}

/** Whether an element would change nothing. */
export const isBlankWrap = (wrap: Wrap): boolean => Object.keys(wrap.style).length === 0 && Object.keys(wrap.attrs).length === 0 && !wrap.className;

/** The elements around a run, outermost first, leaving out those that would change nothing. */
export function wrapsOfRun(theme: Theme, run: Run): Wrap[] {
  return markInputsOf(run)
    .map((input) => wrapOf(theme, input))
    .filter((wrap) => !isBlankWrap(wrap));
}

/** What the elements around a run add up to, inner settings over outer: the run's look as far as it differs from its paragraph's. */
export function flattenWraps(wraps: readonly Wrap[]): Css {
  const flat: Css = {};
  const lines = new Set<string>();
  for (const wrap of wraps) {
    const { textDecoration, ...rest } = wrap.style;
    Object.assign(flat, rest);
    if (typeof textDecoration === "string") for (const line of textDecoration.split(" ")) lines.add(line);
  }
  if (lines.size > 0) flat.textDecoration = [...lines].join(" ");
  return flat;
}
