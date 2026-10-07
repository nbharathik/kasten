// How slide text looks: the single source, used by the read-only drawing and
// by the editor so that both draw the same words in the same places.
//
// A paragraph's `div` carries its base look (the theme text style it is set
// in) and every run only what it changes, so the look of a run is what its
// paragraph says with the run's own settings on top. `runCss` and
// `resolveStyle` give that look in full; `paragraphCss` gives the paragraph's
// own part.

import type { Align, Paragraph, Run, TextStyle, Theme } from "@kasten-slides/wasm";

import { colorOf, fontStack, hexOf } from "../theme/index.ts";
import { type Css, ptToPx, px } from "./css.ts";
import { levelOf } from "./lists.ts";
import { DEFAULT_LINE_SPACING, LIST_INDENT, LIST_STEP } from "./metrics.ts";

export { cssText } from "./css.ts";
export type { Css } from "./css.ts";
export { listNumbers, markerFor } from "./lists.ts";

/** What a text is drawn in when its theme has no text style of the asked name and no `body`. */
const FALLBACK_STYLE: TextStyle = { size: 18, color: "text1", font: "body" };

/** A run with nothing set: the look of the paragraph itself. */
export const EMPTY_RUN: Run = { t: "" };

/** The theme text style a paragraph is set in: its own `style`, else the box's `baseStyle`, else `body`. */
export function textStyleOf(theme: Theme, baseStyle: string, paragraph?: Pick<Paragraph, "style"> | null): TextStyle {
  const own = paragraph?.style ? theme.textStyles[paragraph.style] : undefined;
  return own ?? theme.textStyles[baseStyle] ?? theme.textStyles.body ?? FALLBACK_STYLE;
}

/** The effective look of a stretch of text. Size is in points; colour is a token or hex and font a role or family, as stored. */
export interface ResolvedStyle {
  size: number;
  color: string;
  font: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  link: string | null;
}

export const isSize = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * The effective look of a run: the text style of the box (`baseStyle`, or
 * `body` when the theme has none of that name), replaced by the paragraph's
 * own `style` when it names one, with the run's own size, colour, font, bold
 * and italic on top. A `code` run is set in the code font unless it names a
 * font, and a `math` run in italics.
 */
export function resolveStyle(theme: Theme, baseStyle: string, paragraph: Paragraph, run: Run): ResolvedStyle {
  const style = textStyleOf(theme, baseStyle, paragraph);
  const font = run.font?.trim();
  return {
    size: isSize(run.size) ? run.size : style.size,
    color: run.color && hexOf(theme, run.color) ? run.color : style.color,
    font: font ? font : run.code ? "code" : style.font,
    bold: Boolean(run.b) || Boolean(style.bold),
    italic: Boolean(run.i) || Boolean(style.italic) || Boolean(run.math),
    underline: Boolean(run.u),
    strike: Boolean(run.s),
    code: Boolean(run.code),
    link: run.link ? run.link : null,
  };
}

/** How a paragraph is aligned: its own `align`, else its text style's, else left. */
export function resolveAlign(theme: Theme, baseStyle: string, paragraph: Pick<Paragraph, "align" | "style">): Align {
  return paragraph.align ?? textStyleOf(theme, baseStyle, paragraph).align ?? "left";
}

/** The faint ground behind inline code: the theme's text colour at 8%. */
export const codeBackground = (theme: Theme): string => colorOf(theme, "text1", 0.08);

/**
 * The complete look of a run as CSS: family, size, weight, slant, colour and
 * lines. The link colour is the theme's `accent1` and a link is underlined.
 */
export function runCss(theme: Theme, baseStyle: string, paragraph: Paragraph, run: Run): Css {
  const look = resolveStyle(theme, baseStyle, paragraph, run);
  const css: Css = {
    fontFamily: fontStack(theme, look.font),
    fontSize: px(ptToPx(look.size)),
    fontWeight: look.bold ? 700 : 400,
    fontStyle: look.italic ? "italic" : "normal",
    color: colorOf(theme, look.link ? "accent1" : look.color),
  };
  const lines: string[] = [];
  if (look.underline || look.link) lines.push("underline");
  if (look.strike) lines.push("line-through");
  if (lines.length > 0) css.textDecoration = lines.join(" ");
  if (look.code) {
    css.background = codeBackground(theme);
    css.borderRadius = "3px";
  }
  return css;
}

/** What paragraphs are drawn against besides their own settings. */
export interface ParagraphContext {
  /** The step being shown: paragraphs that appear at a later step are hidden, but keep their place. */
  step?: number;
}

/**
 * The size, in points, that lines of this paragraph are measured by. A block of
 * text has a first invisible "strut" of its own font size on every line, so
 * when every run sets a size of its own, the paragraph takes the smallest of
 * them and lines stay as tight as the text in them. Otherwise it is the size
 * of the paragraph's text style.
 */
export function strutSize(theme: Theme, baseStyle: string, paragraph: Paragraph): number {
  const own = resolveStyle(theme, baseStyle, paragraph, EMPTY_RUN).size;
  const sized = paragraph.runs.filter((run) => run.t !== "");
  if (sized.length === 0 || !sized.every((run) => isSize(run.size))) return own;
  return Math.min(...sized.map((run) => run.size as number));
}

/**
 * The look of a list marker: the first run's size, colour, font, weight and
 * slant, as PowerPoint draws bullets, so a paragraph set in 32 pt has a
 * bullet to match. Custom properties, read by the `.ks-marker` rules.
 */
export function markerCss(theme: Theme, baseStyle: string, paragraph: Paragraph): Css {
  const first = paragraph.runs.find((run) => run.t !== "") ?? paragraph.runs[0] ?? EMPTY_RUN;
  const look = resolveStyle(theme, baseStyle, paragraph, { ...first, code: false, math: false });
  return {
    "--ks-marker-size": px(ptToPx(look.size)),
    "--ks-marker-family": fontStack(theme, look.font),
    "--ks-marker-color": colorOf(theme, look.color),
    "--ks-marker-weight": String(look.bold ? 700 : 400),
    "--ks-marker-style": look.italic ? "italic" : "normal",
  };
}

/**
 * The part of a paragraph's CSS that its own settings decide: base family,
 * weight, slant and colour, alignment, line height and spacing, and the
 * hanging indent of a list item.
 */
export function paragraphBlockCss(theme: Theme, baseStyle: string, paragraph: Paragraph, ctx?: ParagraphContext | null): Css {
  const style = textStyleOf(theme, baseStyle, paragraph);
  const look = resolveStyle(theme, baseStyle, paragraph, EMPTY_RUN);
  const level = levelOf(paragraph);
  const css: Css = {
    fontFamily: fontStack(theme, look.font),
    fontWeight: look.bold ? 700 : 400,
    fontStyle: look.italic ? "italic" : "normal",
    color: colorOf(theme, look.color),
    textAlign: resolveAlign(theme, baseStyle, paragraph),
    lineHeight: paragraph.lineSpacing ?? style.lineSpacing ?? DEFAULT_LINE_SPACING,
    marginTop: px(ptToPx(paragraph.spaceBefore ?? style.spaceBefore ?? 0)),
    marginBottom: px(ptToPx(paragraph.spaceAfter ?? style.spaceAfter ?? 0)),
  };
  if (paragraph.list) {
    css.paddingLeft = px(LIST_INDENT + LIST_STEP * level);
    css.textIndent = px(-LIST_INDENT);
    css["--ks-indent"] = px(LIST_INDENT);
  } else if (level > 0) {
    css.paddingLeft = px(LIST_STEP * level);
  }
  const shown = ctx?.step;
  if (shown !== undefined && paragraph.step != null && paragraph.step > shown) css.visibility = "hidden";
  return css;
}

/** The part of a paragraph's CSS that depends on the runs in it: its line measure and its marker. */
export function paragraphFlowCss(theme: Theme, baseStyle: string, paragraph: Paragraph): Css {
  const css: Css = { fontSize: px(ptToPx(strutSize(theme, baseStyle, paragraph))) };
  return paragraph.list ? { ...css, ...markerCss(theme, baseStyle, paragraph) } : css;
}

/**
 * Everything a paragraph's `div` is styled with: alignment, line height as a
 * unitless multiple, space before and after in pixels, the hanging indent of
 * a list item (`padding-left` of `LIST_INDENT + LIST_STEP * level` with a
 * `text-indent` of `-LIST_INDENT`), the base look of its text style, and the
 * size its lines are measured by. `ctx.step` hides paragraphs of later steps.
 */
export function paragraphCss(theme: Theme, baseStyle: string, paragraph: Paragraph, ctx?: ParagraphContext | null): Css {
  return { ...paragraphBlockCss(theme, baseStyle, paragraph, ctx), ...paragraphFlowCss(theme, baseStyle, paragraph) };
}
