// The settings of a paragraph, as the attributes of a ProseMirror node and
// as fields of a `Paragraph`. Anything a paragraph holds that the format
// does not define travels in `extra`, as JSON, so it comes back unchanged.

import type { Align, ListKind, Paragraph, Run } from "@kasten-slides/wasm";

export interface ParagraphAttrs {
  align: Align | null;
  list: ListKind | null;
  level: number | null;
  style: string | null;
  spaceBefore: number | null;
  spaceAfter: number | null;
  lineSpacing: number | null;
  step: number | null;
  /** The paragraph's unknown fields as a JSON object, or null. */
  extra: string | null;
}

export const NO_ATTRS: Readonly<ParagraphAttrs> = {
  align: null,
  list: null,
  level: null,
  style: null,
  spaceBefore: null,
  spaceAfter: null,
  lineSpacing: null,
  step: null,
  extra: null,
};

/** The fields of a paragraph the format defines. */
export const PARAGRAPH_KEYS: ReadonlySet<string> = new Set(["runs", "align", "list", "level", "style", "spaceBefore", "spaceAfter", "lineSpacing", "step"]);

const ALIGNS: readonly string[] = ["left", "center", "right", "justify"];
const LISTS: readonly string[] = ["bullet", "number"];

const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const whole = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);

/** Attributes from anything: each one valid or null. What a node holds is checked here, not trusted. */
export function readAttrs(raw: Readonly<Record<string, unknown>>): ParagraphAttrs {
  const extra = raw.extra;
  return {
    align: typeof raw.align === "string" && ALIGNS.includes(raw.align) ? (raw.align as Align) : null,
    list: typeof raw.list === "string" && LISTS.includes(raw.list) ? (raw.list as ListKind) : null,
    level: whole(raw.level),
    style: typeof raw.style === "string" && raw.style !== "" ? raw.style : null,
    spaceBefore: number(raw.spaceBefore),
    spaceAfter: number(raw.spaceAfter),
    lineSpacing: number(raw.lineSpacing),
    step: whole(raw.step),
    extra: typeof extra === "string" && extra !== "" ? extra : null,
  };
}

/** The attributes for a paragraph of a text: its defined settings, and its unknown fields as JSON. */
export function attrsOfParagraph(paragraph: Paragraph): ParagraphAttrs {
  const unknown: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(paragraph)) if (!PARAGRAPH_KEYS.has(key)) unknown[key] = value;
  return readAttrs({ ...paragraph, extra: Object.keys(unknown).length > 0 ? JSON.stringify(unknown) : null });
}

/** A paragraph with these settings and these runs, its unknown fields put back. */
export function paragraphOfAttrs(attrs: ParagraphAttrs, runs: Run[] = []): Paragraph {
  const paragraph: Paragraph = { runs };
  if (attrs.align !== null) paragraph.align = attrs.align;
  if (attrs.list !== null) paragraph.list = attrs.list;
  if (attrs.level !== null) paragraph.level = attrs.level;
  if (attrs.style !== null) paragraph.style = attrs.style;
  if (attrs.spaceBefore !== null) paragraph.spaceBefore = attrs.spaceBefore;
  if (attrs.spaceAfter !== null) paragraph.spaceAfter = attrs.spaceAfter;
  if (attrs.lineSpacing !== null) paragraph.lineSpacing = attrs.lineSpacing;
  if (attrs.step !== null) paragraph.step = attrs.step;
  if (attrs.extra !== null) {
    for (const [key, value] of Object.entries(parseObject(attrs.extra))) {
      if (!PARAGRAPH_KEYS.has(key) && key !== "__proto__") Object.defineProperty(paragraph, key, { value, enumerable: true, writable: true, configurable: true });
    }
  }
  return paragraph;
}

/** A JSON object's fields, or none if the text is not one. */
export function parseObject(json: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(json);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
