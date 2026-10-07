// The box that text sits in. TextBlock and the editor build it from the same
// function, which is what keeps words in place when editing starts.

import type { Insets, Text, VAlign } from "@kasten-slides/wasm";

import { type Css, px } from "./css.ts";
import { DEFAULT_INSETS } from "./metrics.ts";

export interface BoxSettings {
  /** The box size in slide units. */
  width: number;
  height: number;
  /** Space between the edge and the text; the text's own `insets` win. */
  insets?: Insets | null | undefined;
  /** Where the text sits in the box; the text's own `valign` wins. */
  valign?: VAlign | null | undefined;
}

const JUSTIFY: Readonly<Record<VAlign, string>> = { top: "flex-start", middle: "center", bottom: "flex-end" };

const finite = (value: number, fallback: number): number => (Number.isFinite(value) ? value : fallback);

/** The insets and vertical alignment a text is drawn with: its own, else the box's, else the defaults. */
export function boxOf(text: Pick<Text, "insets" | "valign">, settings: Pick<BoxSettings, "insets" | "valign">): { insets: Insets; valign: VAlign } {
  const insets = text.insets ?? settings.insets ?? DEFAULT_INSETS;
  return {
    insets: {
      left: finite(insets.left, DEFAULT_INSETS.left),
      top: finite(insets.top, DEFAULT_INSETS.top),
      right: finite(insets.right, DEFAULT_INSETS.right),
      bottom: finite(insets.bottom, DEFAULT_INSETS.bottom),
    },
    valign: text.valign ?? settings.valign ?? "top",
  };
}

/**
 * The box itself: it fills its parent, stacks paragraphs from the top, the
 * middle or the bottom, and lets long text run past its edge. It also fixes
 * the inherited settings a page might change (spacing, case, ligatures), so
 * slide text does not depend on the CSS around it.
 */
export function boxCss(settings: BoxSettings, text: Pick<Text, "insets" | "valign"> = {}): Css {
  const { insets, valign } = boxOf(text, settings);
  return {
    position: "absolute",
    inset: "0px",
    width: px(settings.width),
    height: px(settings.height),
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: JUSTIFY[valign],
    padding: `${px(insets.top)} ${px(insets.right)} ${px(insets.bottom)} ${px(insets.left)}`,
    margin: "0px",
    overflow: "visible",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    letterSpacing: "normal",
    wordSpacing: "normal",
    textTransform: "none",
    textIndent: "0px",
    textShadow: "none",
    fontVariantLigatures: "none",
    fontFeatureSettings: "normal",
    hyphens: "manual",
  };
}
