import type { RemarkProcessor } from "../remark-context";
// Notion's text and background colours, stored as inline HTML that other
// Markdown tools render too:
//
//   <span style="color: red">text</span>
//   <span style="background-color: yellow">text</span>
//
// Only Notion's colour names (all valid CSS names) become marks; any other
// span stays raw HTML, untouched.

import type { MarkType } from "@milkdown/kit/prose/model";
import type { EditorState, Transaction } from "@milkdown/kit/prose/state";
import { $markSchema, $remark } from "@milkdown/kit/utils";

import { groupHtmlPairs, htmlPairHandler, type HtmlPair } from "./inline-html";
import { eachParent, type MdNode } from "./mdast";

export const NOTION_COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] as const;
export type NotionColor = (typeof NOTION_COLORS)[number];
export type ColorProperty = "color" | "background-color";

const isNotionColor = (value: string | undefined): value is NotionColor =>
  (NOTION_COLORS as readonly string[]).includes(value ?? "");

/** A colour from pasted HTML: one of Notion's, or gray. It is written into
 * the page's HTML, so nothing else may ride along. */
export const pastedColor = (value: string | null): NotionColor => (isNotionColor(value ?? undefined) ? (value as NotionColor) : "gray");

const OPEN = /^<span\s+style\s*=\s*(["'])\s*(color|background-color)\s*:\s*([a-z]+)\s*;?\s*\1\s*>$/i;

/** `<span style="…">…</span>` with a Notion colour; other spans stay raw HTML. */
const colorSpans: HtmlPair<{ property: string; color: string }> = {
  open(html) {
    const match = OPEN.exec(html);
    const color = match?.[3]?.toLowerCase();
    return match && isNotionColor(color) ? { property: match[2]!.toLowerCase(), color } : null;
  },
  nests: (html) => /^<span[\s>]/i.test(html),
  close: (html) => /^<\/span\s*>$/i.test(html),
  build: ({ property, color }, children) => ({ type: "kastenColor", property, color, children }),
};

const kastenColor = htmlPairHandler((node) => `<span style="${String(node.property)}: ${String(node.color)}">`, "</span>");


export const remarkColor = $remark("kastenColor", () => function (this: RemarkProcessor) {
  const data = this.data();
  (data.toMarkdownExtensions ??= []).push({ handlers: { kastenColor } });
  return (tree: unknown) => {
    eachParent(tree as MdNode, (parent) => {
      if (parent.children.some((c) => c.type === "html")) parent.children = groupHtmlPairs(parent.children, colorSpans);
    });
  };
});

function colorMark(name: "text_color" | "bg_color", property: ColorProperty) {
  return $markSchema(name, () => ({
    attrs: { color: { default: "gray" } },
    parseDOM: [
      {
        tag: `span[data-${name}]`,
        getAttrs: (dom) => ({ color: pastedColor((dom as HTMLElement).getAttribute(`data-${name}`)) }),
      },
    ],
    toDOM: (mark) => ["span", { [`data-${name}`]: mark.attrs.color, class: `kasten-${name}-${mark.attrs.color}` }],
    parseMarkdown: {
      match: (node) => node.type === "kastenColor" && node.property === property,
      runner: (state, node, markType) => {
        state.openMark(markType, { color: node.color });
        state.next(node.children);
        state.closeMark(markType);
      },
    },
    toMarkdown: {
      match: (mark) => mark.type.name === name,
      runner: (state, mark) => {
        state.withMark(mark, "kastenColor", undefined, { property, color: mark.attrs.color });
      },
    },
  }));
}

export const textColorSchema = colorMark("text_color", "color");
export const bgColorSchema = colorMark("bg_color", "background-color");

export interface LastColor {
  mark: "text_color" | "bg_color";
  color: NotionColor;
}

let last: LastColor = { mark: "bg_color", color: "yellow" };

/** The colour Ctrl+Shift+H applies: the last one picked, as in Notion. */
export const lastColor = (): LastColor => last;

export function rememberColor(mark: string, color: NotionColor | null): void {
  if (color && (mark === "text_color" || mark === "bg_color")) last = { mark, color };
}

/** Colours the selection, or clears it with `null`. With an empty selection
 * the colour applies to what is typed next, as in Notion. */
export function applyColor(state: EditorState, markType: MarkType, color: NotionColor | null): Transaction {
  rememberColor(markType.name, color);
  const { from, to, empty } = state.selection;
  const tr = state.tr;
  if (empty) {
    const marks = (state.storedMarks ?? state.selection.$from.marks()).filter((m) => m.type !== markType);
    return tr.setStoredMarks(color ? [...marks, markType.create({ color })] : marks);
  }
  tr.removeMark(from, to, markType);
  if (color) tr.addMark(from, to, markType.create({ color }));
  return tr;
}
