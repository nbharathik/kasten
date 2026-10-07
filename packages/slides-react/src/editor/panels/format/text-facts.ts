// How the words in the selected boxes are set, worked out from the deck: what
// the panel's paragraph controls show while no text box is open.

import type { Align, Element, Insets, ListKind, Paragraph, Text, Theme, VAlign } from "@kasten-slides/wasm";

import { DEFAULT_INSETS } from "../../../text/metrics.ts";
import { resolveAlign } from "../../../text/text-style.ts";
import { placeholderOf } from "../../../theme/index.ts";
import { type Mixed, agree, textOf } from "./values.ts";

export const SIDES = ["left", "top", "right", "bottom"] as const;

export interface TextFacts {
  align: Align | Mixed;
  /** A multiple of the line height; null for the theme's own. */
  lineSpacing: number | null | Mixed;
  /** Points; null for the theme's own. */
  spaceBefore: number | null | Mixed;
  spaceAfter: number | null | Mixed;
  list: ListKind | null | Mixed;
  valign: VAlign | Mixed;
  insets: Record<(typeof SIDES)[number], number | Mixed>;
}

/** The insets a text is drawn with: its own, else the usual. */
export const insetsOf = (text: Text): Insets => ({ ...DEFAULT_INSETS, ...text.insets });

/** The vertical place words take in a box that does not say: a slot's own, else the middle of a shape and the top of a text box. */
export function valignOf(theme: Theme, layout: string, element: Element, text: Text): VAlign {
  return text.valign ?? placeholderOf(theme, layout, element)?.valign ?? (element.type === "shape" ? "middle" : "top");
}

/** What the boxes agree on, and "mixed" where they do not. */
export function textFacts(theme: Theme, layout: string, elements: readonly Element[]): TextFacts {
  const boxes = elements.flatMap((element) => {
    const text = textOf(element);
    return text ? [{ element, text, base: placeholderOf(theme, layout, element)?.style ?? "body" }] : [];
  });
  const paragraphs = boxes.flatMap(({ text, base }) => text.paragraphs.map((paragraph): [Paragraph, string] => [paragraph, base]));
  const each = <T>(pick: (paragraph: Paragraph) => T, none: T) => agree(paragraphs.map(([paragraph]) => pick(paragraph)), none);
  return {
    align: agree(paragraphs.map(([paragraph, base]) => resolveAlign(theme, base, paragraph)), "left"),
    lineSpacing: each((p) => p.lineSpacing ?? null, null),
    spaceBefore: each((p) => p.spaceBefore ?? null, null),
    spaceAfter: each((p) => p.spaceAfter ?? null, null),
    list: each((p) => p.list ?? null, null),
    valign: agree(boxes.map(({ element, text }) => valignOf(theme, layout, element, text)), "top"),
    insets: {
      left: agree(boxes.map(({ text }) => insetsOf(text).left), DEFAULT_INSETS.left),
      top: agree(boxes.map(({ text }) => insetsOf(text).top), DEFAULT_INSETS.top),
      right: agree(boxes.map(({ text }) => insetsOf(text).right), DEFAULT_INSETS.right),
      bottom: agree(boxes.map(({ text }) => insetsOf(text).bottom), DEFAULT_INSETS.bottom),
    },
  };
}

/** Every paragraph of a text made a list of this kind, or a plain paragraph for null. */
export function withList(text: Text, kind: ListKind | null): Text {
  return {
    ...text,
    paragraphs: text.paragraphs.map((paragraph) => {
      const { list: _list, level: _level, ...rest } = paragraph;
      return kind === null ? rest : { ...rest, list: kind, level: paragraph.level ?? 0 };
    }),
  };
}

/** The same text with a setting changed on each paragraph. */
export function withParagraphs(text: Text, change: (paragraph: Paragraph) => Paragraph): Text {
  return { ...text, paragraphs: text.paragraphs.map(change) };
}
