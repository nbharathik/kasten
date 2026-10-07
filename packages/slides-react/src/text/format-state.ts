// How the selected text is formatted, for a toolbar: each setting has one
// value when everything selected agrees on it, and "mixed" when it does not.

import type { Align, ListKind, TextStyle } from "@kasten-slides/wasm";
import type { Mark } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { type EditorContext, caretMarks, markRange, selectedParagraphs, selectedPieces, styleOfNode } from "./selection-info.ts";
import { attrsOf } from "./schema.ts";
import { resolveAlign, textStyleOf } from "./text-style.ts";

/** A yes, a no, or a selection that holds both. */
export type Tri = boolean | "mixed";

/**
 * `null` means the setting is not overridden: the text style's own value
 * applies. `bold` and `italic` are what the text shows, so they are on in a
 * bold title even though no run says so; `align` is likewise the alignment
 * shown.
 */
export interface FormatState {
  bold: Tri;
  italic: Tri;
  underline: Tri;
  strike: Tri;
  code: Tri;
  color: string | "mixed" | null;
  size: number | "mixed" | null;
  font: string | "mixed" | null;
  align: Align | "mixed";
  list: ListKind | "mixed" | null;
  /** The level of the first paragraph selected. */
  level: number;
  link: string | "mixed" | null;
  lineSpacing: number | "mixed" | null;
}

/** One stretch of the selection: the marks its text has, and the text style it is set in. */
interface Sample {
  marks: readonly Mark[];
  style: TextStyle;
}

function samplesOf(state: EditorState, ctx: EditorContext): Sample[] {
  const samples = selectedPieces(state).map((piece) => ({ marks: piece.text.marks, style: styleOfNode(ctx, piece.paragraph) }));
  if (samples.length > 0) return samples;
  // A caret, or a selection of empty paragraphs: what text typed here would get.
  const first = selectedParagraphs(state)[0]?.node;
  return [{ marks: caretMarks(state), style: first ? styleOfNode(ctx, first) : textStyleOf(ctx.theme, ctx.baseStyle) }];
}

const has = (sample: Sample, name: string): boolean => sample.marks.some((mark) => mark.type.name === name);

function valueOf(sample: Sample, name: string, key: string): unknown {
  return sample.marks.find((mark) => mark.type.name === name)?.attrs[key];
}

const textOf = (sample: Sample, name: string, key: string): string | null => {
  const value = valueOf(sample, name, key);
  return typeof value === "string" && value !== "" ? value : null;
};

/** The one value they all have, or "mixed". */
function agree<T>(values: readonly T[], none: T): T | "mixed" {
  const [first] = values;
  if (values.length === 0) return none;
  return values.every((value) => value === first) ? (first as T) : "mixed";
}

export function formatStateOf(state: EditorState, ctx: EditorContext): FormatState {
  const samples = samplesOf(state, ctx);
  const attrs = selectedParagraphs(state).map((located) => attrsOf(located.node));
  return {
    bold: agree(samples.map((s) => has(s, "bold") || Boolean(s.style.bold)), false),
    italic: agree(samples.map((s) => has(s, "italic") || Boolean(s.style.italic)), false),
    underline: agree(samples.map((s) => has(s, "underline")), false),
    strike: agree(samples.map((s) => has(s, "strike")), false),
    code: agree(samples.map((s) => has(s, "code")), false),
    color: agree(samples.map((s) => textOf(s, "color", "value")), null),
    size: agree(
      samples.map((s) => {
        const size = valueOf(s, "size", "value");
        return typeof size === "number" && size > 0 ? size : null;
      }),
      null,
    ),
    font: agree(samples.map((s) => textOf(s, "font", "value")), null),
    align: agree(attrs.map((a) => resolveAlign(ctx.theme, ctx.baseStyle, a)), "left" as Align),
    list: agree(attrs.map((a) => a.list), null),
    level: attrs[0]?.level ?? 0,
    link: agree(samples.map((s) => textOf(s, "link", "href")), null),
    lineSpacing: agree(attrs.map((a) => a.lineSpacing), null),
  };
}

/** The address of the link the selection is in, or that the caret touches; null when there is none or the selection holds several. */
export function linkAtSelection(state: EditorState): string | null {
  const type = state.schema.marks.link;
  if (!type) return null;
  if (state.selection.empty) {
    const href: unknown = markRange(state.selection.$from, type)?.mark.attrs.href;
    return typeof href === "string" ? href : null;
  }
  const hrefs = selectedPieces(state).map((piece) => {
    const value: unknown = type.isInSet(piece.text.marks)?.attrs.href;
    return typeof value === "string" ? value : null;
  });
  const first = hrefs[0];
  return first !== undefined && hrefs.every((href) => href === first) ? first : null;
}
